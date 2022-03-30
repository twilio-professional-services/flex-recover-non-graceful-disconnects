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
      if (utils.isRecoveryPingTask(reservation.task)) {
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

  // PING TASK LOGIC
  // ---------------
  if (utils.isRecoveryPingTask(task)) {
    console.debug("initializeReservation > recovery ping task", task);
    // Auto accept the task
    console.debug(
      `initializeReservation > about to accept task ${reservationSid}`
    );
    
    Actions.invokeAction("AcceptTask", {
      sid: reservationSid,
    });

    utils.showReconnectDialog("Disconnected from customer.", "Reconnecting you now...");

    return;
  }

  // CALL TASK LOGIC
  // ---------------
  if (TaskHelper.isCallTask(task)) {
    console.debug("initializeReservation > call task", task);
    // If it's a warm transfer, we don't care for all the remaining logic
    if (utils.isIncomingTransfer(task)) {
      console.debug("initializeReservation > incomingTransferObject", task.incomingTransferObject);
      if (utils.isIncomingWarmTransfer(task)) {
        console.debug("initializeReservation > Skipping reconnect logic for warm transfers");
        return;
      }
    }

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
          if (reservation.task.attributes.wasPingSuccessful) {
            console.debug(
              `Retaining dialog`
            );
          } else {
            console.debug(
              `Closing dialog`
            );
            utils.closeReconnectDialog();
          }
        });
      });
      
      // This action will show the modal dialog - essentially blocking UI input
      utils.showReconnectDialog("Disconnected from customer.", "Awaiting reconnection...");

      return;
    }

    // Reconnect calls get special auto-answer
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
  // worker.
  if (
    TaskHelper.isCallTask(task)
  ) {

    console.debug(
      "reservationAccepted > Waiting for customer and worker to join the conference"
    );

    // It can take a few milliseconds for the conference and partricpants to be populated in Redux
    await waitForConferenceParticipants(task);

    const myParticipant = utils.getMyWorkerParticipantFromConference(task.conference);

    // Add the worker's details to backend state model for use by conference status callback
    // Only when there's one worker left on the conference, do we engage the recovery logic upon
    // non-graceful disconnect 
    await ConferenceStateService.addWorker(
      task.conference.conferenceSid,
      task.taskSid,
      task.attributes,
      task.workflowSid,
      task.attributes.call_sid, // customer call SID
      task.workerSid,
      task.sid,
      myParticipant.callSid,
      utils.manager.workerClient.attributes.full_name
    );

    // *** IMPORTANT NOTE! *********
    // By this point, Flex's own reservationAccepted logic will have detected that there are only 2 participants, and
    // will have made sure the worker's `endConferenceOnExit` flag is set to true (despite any effort we make to initialize it
    // to false during AcceptTask). Solution Gap is open for this lack of configurability.
    // Our conference status callback listener *might* react to the `participant-modify` event and undo this - depending on timing.
    // However, sometimes the `participant-modify` event arrives before/during the call to `addWorker()` above, and so can't tell
    // if it's for an agent or some other participant. Best to explitly make the update here too.
    // explicitly apply the update here also.
    await ConferenceService.updateEndConferenceOnExit(
      task.conference.conferenceSid,
      myParticipant.callSid,
      false
    );



    // If this is a reconnect task (and it's not an 'old' one that's just been transferred to me), update the modal dialog message 
    // and bring in the others!
    if (task.attributes.isReconnect && !utils.isIncomingTransfer(task)) {
      console.debug("It's a reconnect task");

      let message = "Reconnected with customer!";
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
      utils.showReconnectDialog(message, messageDetail);

      // Do a slow close of the dialog - to give agent a chance to see it!
      setTimeout(() => {
        utils.closeReconnectDialog();
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

      if (!utils.isTaskActive(task)) {
        console.debug(
          "waitForConferenceParticipants > Call canceled, clearing waitForConferenceInterval"
        );
        waitForConferenceInterval = clearInterval(waitForConferenceInterval);
        return;
      }
      if (!conference || !conference.conferenceSid) {
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

      const worker = utils.getMyWorkerParticipantFromConference(conference);
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

      resolve();
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
