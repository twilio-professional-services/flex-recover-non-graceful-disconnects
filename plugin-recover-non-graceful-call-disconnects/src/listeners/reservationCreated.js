import {
  Actions,
  TaskHelper,
  Utils
} from "@twilio/flex-ui";
import { Constants, utils } from "../utils";
import { ConferenceService, ConferenceStateService } from "../services";

const reservationListeners = new Map();

/**
 * Handles reservationCreated events for all 'reconnect ping' tasks, and
 * auto accepts and completes them - to trigger downstream serverless logic
 * that responds to the successful ping (i.e. Taskrouter workspace event listener)
 */
export default function reservationCreated() {
  utils.manager.workerClient.on("reservationCreated", (reservation) => {
    console.debug(`Initializing new reservation ${reservation.sid}`);
    initializeReservation(reservation);
  });

  utils.manager.events.addListener("pluginsLoaded", async () => {

    // In addition to the reservationCreated listener logic, we need to also account for the fact that
    // the UI may not actually receive this event (e.g if it fires during a page refresh, or if browser
    // not reachable)
    // Do the call tasks first
    utils.manager.workerClient.reservations.forEach((reservation) => {
      if (
        TaskHelper.isCallTask(reservation.task) &&
        TaskHelper.isInWrapupMode(reservation.task)
      ) {
        console.debug(
          `Initializing reservation ${reservation.sid} from pre-existing worker call task`
        );
        initializeReservation(reservation);
      }
    });
    // Then do the recovery ping task (if present)
    utils.manager.workerClient.reservations.forEach((reservation) => {
      if (isRecoveryPingTask(reservation.task)) {
        console.debug(
          `Initializing reservation ${reservation.sid} from pre-existing recovery ping task`
        );
        initializeReservation(reservation);
      }
    });
  });
}

async function initializeReservation(reservation) {
  console.debug("initializeReservation", reservation);

  reservation.addListener("accepted", () => reservationAccepted(reservation));

  const reservationSid = reservation.sid;

  const task = TaskHelper.getTaskByTaskSid(reservationSid);

  if (isRecoveryPingTask(task)) {
    console.debug("initializeReservation > recovery ping task", task);
    // Auto accept the task
    console.debug(
      `initializeReservation > about to accept task ${reservationSid}`
    );
    
    Actions.invokeAction("AcceptTask", {
      sid: reservationSid,
    });

    showReconnectDialog("Disconnected from vehicle.", "Reconnecting you now...");

    return;
  }

  if (TaskHelper.isCallTask(task)) {
    console.debug("initializeReservation > call task", task);
    if (TaskHelper.isInWrapupMode(task)) {
      // If we arrived here via a page refresh or similar non-happy path, and task is in
      // wrapping state, verify that the agent did not terminate the call ungracefully
      // NOTE: Conference status callback will have updated task's followed_by attribute
      // if that's the case
      if (
        task.attributes.conversations?.followed_by !== "Reconnect Agent"
      ) {
        console.debug(`Conference was gracefully hung up. All good.`);
        return;
      } 

      console.debug(
        `Conference was non-gracefully disconnected. Prepare for reconnect`
      );

      // Setup the reservation listeners that'll handle the completion of the disconnected task
      // (this'll ensure the modal dialog is closed whenever reconnect task is routed to another agent
      // since the reconnect task triggers the forced completion of the disconnected task)
      const reservationFinishedEvents = ["timeout", "canceled", "rescinded", "completed", "wrapup"];
      reservationFinishedEvents.forEach((event) => {
        reservation.addListener(event, (reservation) => {
          console.debug(
            `Reservation finished. Attributes`, reservation.task.attributes
          );
          if (reservation.task.attributes.wasPingSuccessful === true) {
            console.debug(
              `Retaining dialog`
            );
          } else {
            console.debug(
              `Closing dialog`
            );
            closeReconnectDialog();
          }
        });
      });
      
      // This action will show the modal dialog - essentially blocking UI input
      showReconnectDialog("Disconnected from vehicle.", "Awaiting reconnection...");

      return;
    }

    if (task.attributes.isReconnect) {
      console.debug("Reconnect call!");

      if (task.attributes.disconnectedWorkerSid === utils.manager.workerClient.sid) {
        // Need to auto-answer through here (or through existing auto-answer logic) - since modal dialog 
        // blocks any input.
        if (Constants.AUTO_ANSWER_RECONNECT_TASKS) {
          console.debug("Auto answering reconnect call!");

          Actions.invokeAction("AcceptTask", {
            sid: reservation.sid,
          });
        }

      }  


    }
    return;
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

    await ConferenceStateService.addActiveConference(
      task.conference.conferenceSid,
      task.taskSid,
      task.attributes,
      task.workflowSid,
      task.workerSid,
      task.attributes.call_sid,
      myParticipant.callSid,
      utils.manager.workerClient.attributes.full_name
    );

    // By this point, Flex's own reservationAccepted logic will have detected that there are only 2 participants, and
    // will have made sure the worker's endConferenceOnExit flag is set to true (despite any effort we make to initialize it
    // to false during AcceptTask). So we are best to just wait til everyone has joined, conference has started, and then
    // make the update to the worker participant.
    // TODO: Validate this endConferenceOnExit workaround isn't a race condition - by refreshing page as soon as call is accepted.
    // TODO: This logic should be shifted to our conference status callback listener (but there's a bug with `conference-modify` event type)
    await ConferenceService.updateEndConferenceOnExit(
      task.conference.conferenceSid,
      myParticipant.callSid,
      false
    );

    // If this is a reconnect task, update the modal dialog message and bring in the others!
    if (task.attributes.isReconnect === true) {
      console.debug("It's a reconnect task");

      let message = "Reconnected with vehicle!";
      let messageDetail = undefined;

      if (task.attributes.disconnectedWorkerSid != utils.manager.workerClient.sid) {
        const disconnectedWorkerName = task.attributes.disconnectedWorkerName;
        // Get duration in secs
        const duration = Utils.formatTimeDuration(
            Math.max(Date.now() - Date.parse(task.attributes.disconnectedTime), 0),
            "compact"
        );
        messageDetail = `${disconnectedWorkerName} dropped ${duration} ago`;
      }

      // If the disconnected agent was me, then we use the dialog
      showReconnectDialog(message, messageDetail);

      // Do a slow close of the dialog - to give agent a chance to see it!
      setTimeout(() => {
        closeReconnectDialog();
      }, 3000);

      ConferenceService.moveParticipantsToNewConference(
        task.attributes.disconnectedConferenceSid,
        task.conference.sid // This is actually the taskSid (used as name of conference)
      );

      Actions.invokeAction("SelectTask", {
        sid: reservation.sid,
      });
    }
    return;
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
      if (conference === undefined || conference.conferenceSid === undefined) {
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

function showReconnectDialog(message, messageDetail) {
  Actions.invokeAction("SetComponentState", {
    name: "ReconnectDialog",
    state: { isOpen: true, message, messageDetail },
  });
}

function closeReconnectDialog() {
  Actions.invokeAction("SetComponentState", {
    name: "ReconnectDialog",
    state: { isOpen: false },
  });
}
