import { Actions, Notifications, TaskHelper } from "@twilio/flex-ui";
import { Constants, utils } from "../utils";
import { ConferenceService, ConferenceStateService } from "../services";

/**
 * Handles reservationCreated events for all 'reconnect ping' tasks, and
 * auto accepts and completes them - to trigger downstream serverless logic
 * that responds to the successful ping (i.e. Taskrouter workspace event listener)
 */
export default function reservationCreated() {
  // In addition to the reservationCreated listener logic, we need to also account for the fact that
  // the UI may not actually receive this event (e.g if it fires during a page refresh, or if browser
  // not reachable)
  utils.manager.workerClient.reservations.forEach((reservation) => {
    initializeReservation(reservation);
  });

  utils.manager.workerClient.on("reservationCreated", (reservation) => {
    initializeReservation(reservation);
  });
}

function initializeReservation(reservation) {
  console.debug("initializeReservation", reservation);

  const task = TaskHelper.getTaskByTaskSid(reservation.sid);

  if (isRecoveryPingTask(task)) {
    console.debug("initializeReservation > recovery ping task", task);
    reservation.addListener("accepted", () => reservationAccepted(reservation));
    // Auto accept the task
    Actions.invokeAction("AcceptTask", {
      sid: reservation.sid,
    });
    return;
  }

  if (TaskHelper.isCallTask(task)) {
    console.debug("initializeReservation > call task", task);
    reservation.addListener("accepted", () => reservationAccepted(reservation));
  }
}

function isRecoveryPingTask(task) {
  return task.workflowName === "Recovery Ping";
}

/**
 * Handles reservation accepted events - where we wait until conference participants join and then
 * populate the backend state model
 */
async function reservationAccepted(reservation) {
  console.debug("reservationAccepted", reservation);
  const task = TaskHelper.getTaskByTaskSid(reservation.sid);

  /**
   * Ping task logic
   */
  // Display notification of incoming reconnect call (notification allows agent to take action on it)
  // too
  if (isRecoveryPingTask(task)) {
    Notifications.showNotification(
      Constants.FlexNotification.incomingReconnect,
      { recoveryPingTask: task }
    );
  }

  /**
   * Call task logic
   */

  // If task is assigned to me, then persist state to backend (e.g. Sync) so that conference status
  // callback listener can determine who's who...
  // TODO: Make all of this work for transfers too. Right now it only caters to original assigned
  // worker.
  if (
    TaskHelper.isCallTask(task) &&
    task.workerSid === utils.manager.workerClient.sid
  ) {
    console.debug("reservationAccepted > call task YES, worker match YES");
    console.debug(
      "reservationAccepted > Waiting for customer and worker to join the conference"
    );
    const participants = await waitForConferenceParticipants(task);

    const myParticipant = participants.find(
      (p) => p.workerSid === utils.manager.workerClient.sid
    );
    console.debug("reservationAccepted > conference", task.conference);
    console.debug("reservationAccepted > myParticipant", myParticipant);

    if (!myParticipant) {
      console.warn(
        "reservationAccepted > worker participant not found or is not me. Not acting on this task"
      );
      return;
    }

    ConferenceStateService.addActiveConference(
      task.conference.conferenceSid,
      task.sid,
      task.attributes,
      task.workflowSid,
      task.workerSid,
      myParticipant.callSid,
      utils.manager.workerClient.name
    );

    // By this point, Flex's own reservationAccepted logic will have detected that there are only 2 participants, and
    // will have made sure the worker's endConferenceOnExit flag is set to true (despite any effort we make to initialize it
    // to false during AcceptTask). So we are best to just wait til everyone has joined, conference has started, and then
    // make the update to the worker participant.
    // TODO: Validate this endConferenceOnExit workaround isn't a race condition
    ConferenceService.updateEndConferenceOnExit(
      task.conference.conferenceSid,
      myParticipant.callSid,
      false
    );
  }
}

function waitForConferenceParticipants(task) {
  return new Promise((resolve) => {
    const waitTimeMs = 100;

    const maxWaitTimeMs = 5000;
    let waitForConferenceInterval = setInterval(() => {
      const { conference } = task;

      if (!isTaskActive(task)) {
        console.debug(
          "waitForConferenceParticipants > Call canceled, clearing waitForConferenceInterval"
        );
        waitForConferenceInterval = clearInterval(waitForConferenceInterval);
        return;
      }
      if (conference === undefined) {
        console.debug(
          "waitForConferenceParticipants > Conference not yet set on task"
        );
        return;
      }
      const { participants } = conference;
      if (Array.isArray(participants) && participants.length < 2) {
        console.debug(
          "waitForConferenceParticipants > Conference participants not yet joined"
        );
        return;
      }
      const worker = participants.find((p) => p.participantType === "worker");
      const customer = participants.find(
        (p) => p.participantType === "customer"
      );

      if (!worker || !customer) {
        console.warn(
          "waitForConferenceParticipants > Conference participants have joined, but are not expected types"
        );
        return;
      }

      console.debug(
        "waitForConferenceParticipants > Worker and customer participants joined conference"
      );

      waitForConferenceInterval = clearInterval(waitForConferenceInterval);

      resolve(participants);
    }, waitTimeMs);

    setTimeout(() => {
      if (waitForConferenceInterval) {
        console.debug(
          `waitForConferenceParticipants > Participants didn't show up within ${
            maxWaitTimeMs / 1000
          } seconds`
        );
        clearInterval(waitForConferenceInterval);

        resolve([]);
      }
    }, maxWaitTimeMs);
  });
}

function isTaskActive(task) {
  const { sid: reservationSid, taskStatus } = task;
  if (taskStatus === "canceled") {
    return false;
  } else {
    return utils.manager.workerClient.reservations.has(reservationSid);
  }
}
