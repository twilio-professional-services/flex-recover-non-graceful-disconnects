import {
  Actions,
  flexStoreEnhancer,
  Notifications,
  TaskHelper,
} from "@twilio/flex-ui";
import { Constants, utils } from "../utils";
import { ConferenceService, ConferenceStateService } from "../services";
import { ConferenceSyncState, DisconnectedTaskActions } from "../states";

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
    await ConferenceSyncState.initialize();

    // In addition to the reservationCreated listener logic, we need to also account for the fact that
    // the UI may not actually receive this event (e.g if it fires during a page refresh, or if browser
    // not reachable)
    // Do the call tasks first
    utils.workerTasks.forEach((reservation) => {
      if (
        TaskHelper.isCallTask(reservation.source) &&
        TaskHelper.isInWrapupMode(reservation.source)
      ) {
        console.debug(
          `Initializing reservation ${reservation.sid} from pre-existing worker call task`
        );
        initializeReservation(reservation);
      }
    });
    // Then do the recovery ping task (if present)
    utils.workerTasks.forEach((reservation) => {
      if (isRecoveryPingTask(reservation.source)) {
        console.debug(
          `Initializing reservation ${reservation.sid} from pre-existing recovery ping task`
        );
        initializeReservation(reservation);
      }
    });
  });
}

function initializeReservation(reservation) {
  console.debug("initializeReservation", reservation);

  if (reservation.addListener) {
    reservation.addListener("accepted", () => reservationAccepted(reservation));
  }

  // Depending on whether this came from state or from an event, the object will
  // be different...
  const reservationSid = reservation.reservationSid || reservation.sid;

  console.debug("initializeReservation > reservationSid", reservationSid);

  const task = TaskHelper.getTaskByTaskSid(reservationSid);

  if (isRecoveryPingTask(task)) {
    console.debug("initializeReservation > recovery ping task", task);
    // Auto accept the task
    console.debug(
      `initializeReservation > about to accept task ${reservationSid}`
    );

    utils.manager.store.dispatch(
      DisconnectedTaskActions.handleRecoveryPing()
    );
    

    // Demonstrative "SLOW_MODE" delay option
    setTimeout(() => {
      Actions.invokeAction("AcceptTask", {
        sid: reservationSid,
      });

      Actions.invokeAction("SetComponentState", {
        name: "ReconnectDialog",
        state: {
          isOpen: true,
          message: "Reconnecting you with vehicle now...",
        },
      });
    }, Constants.SLOW_MODE ? 3000 : 0);


    // Notifications.showNotification(
    //   Constants.FlexNotification.incomingReconnect,
    //   { recoveryPingTask: task }
    // );

    return;
  }

  if (TaskHelper.isCallTask(task)) {
    console.debug("initializeReservation > call task", task);
    if (TaskHelper.isInWrapupMode(task)) {
      // If we arrived here via a page refresh or similar non-happy path, and task is in
      // wrapping state, verify that the agent did not terminate the call ungracefully
      // NOTE: It's a race condtion to expect Flex to have populated task.conference yet,
      // so look it up using our state model instead.
      console.debug(
        `Looking up current state of conference for wrapping task ${task.taskSid}`
      );
      const currentConferenceState = ConferenceSyncState.currentStateByTask(
        task.taskSid
      );
      if (
        currentConferenceState &&
        currentConferenceState.wasGracefulWorkerDisconnect
      ) {
        console.debug(`Conference was gracefully hung up. All good.`);
        return;
      } else if (!currentConferenceState) {
        console.debug(
          `Conference state not found for this task. It may have ended cleanly and been deleted. All good.`
        );
        return;
      }
      console.debug(
        `Conference was non-gracefully disconnected. Prepare for reconnect`
      );
      
      // This action will show the modal dialog - essentially blocking UI input
      utils.manager.store.dispatch(
        DisconnectedTaskActions.setDisconnectedTask(task.taskSid)
      );

      Actions.invokeAction("SetComponentState", {
        name: "ReconnectDialog",
        state: {
          isOpen: true,
          message: "Disconnected from vehicle. Awaiting reconnection...",
        },
      });

      // Notifications.showNotification(
      //   Constants.FlexNotification.nonGracefulAgentDisconnect
      // );
      return;
    }

    if (task.attributes.isReconnect === true && Constants.AUTO_ANSWER_RECONNECT_TASKS) {
      console.debug("Auto answering reconnect call!");
      // Demonstrative "SLOW_MODE" delay option
      setTimeout(() => {
        Actions.invokeAction("AcceptTask", {
          sid: reservation.sid,
        });
      }, Constants.SLOW_MODE ? 3000 : 0);


    }
    return;
  }
}

function stopReservationListeners(reservation) {
  const listeners = reservationListeners.get(reservation);
  if (listeners) {
    listeners.forEach((listener) => {
      reservation.removeListener(listener.event, listener.callback);
    });
    reservationListeners.delete(reservation);
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
      utils.manager.workerClient.name
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

    // If this is a reconnect task, show the notification and bring in the others!
    if (task.attributes.isReconnect === true) {
      utils.manager.store.dispatch(
        DisconnectedTaskActions.handleReconnectSuccess()
      );

      Actions.invokeAction("SetComponentState", {
        name: "ReconnectDialog",
        state: {
          isOpen: true,
          message: "Reconnected with vehicle! \n\nAny other participants will be patched in now...",
        },
      });

      // Demonstrative "SLOW_MODE" delay option
      setTimeout(async () => {
        ConferenceService.moveParticipantsToNewConference(
          task.attributes.disconnectedConferenceSid,
          task.conference.sid // This is actually the taskSid (used as name of conference)
        );

        // Do a slow close of the dialog - to give agent a chance to see it!
        setTimeout(() => {
          Actions.invokeAction("SetComponentState", {
            name: "ReconnectDialog",
            state: { isOpen: false },
          });
        }, 2500);
      }, Constants.SLOW_MODE ? 2000 : 0);





      // Notifications.showNotification(
      //   Constants.FlexNotification.reconnectSuccessful
      // );
      // Notifications.dismissNotificationById(
      //   Constants.FlexNotification.nonGracefulAgentDisconnect
      // );
      // Notifications.dismissNotificationById(
      //   Constants.FlexNotification.incomingReconnect
      // );



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
