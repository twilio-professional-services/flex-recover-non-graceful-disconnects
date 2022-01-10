import { Actions, TaskHelper } from "@twilio/flex-ui";
import { ConferenceService, ConferenceStateService } from "../services";

import { utils } from "../utils";

/**
 * @typedef { import('@twilio/flex-ui').Manager } Manager
 */

/**
 * Handles beforeHangupCall and ends conference if only 2 or fewer participants
 * (saves need to update endConferenceOnExit flag to true for the agent, and potential latency around
 * that particular update taking effect)
 *
 * @param {Manager} manager
 */
export default function hangupCall() {
  Actions.addListener("beforeHangupCall", (payload) => {
    console.debug("beforeHangupCall", payload);

    const { task } = payload;

    console.debug("beforeHangupCall > task.conference", task.conference);

    // Store (in backend) the fact that this was a graceful disconnect
    // Our conference status callback handler can consequently ignore the agent participant-leave event
    ConferenceStateService.setGracefulDisconnect(task.conference.conferenceSid);

    if (
      TaskHelper.isCallTask(task) &&
      task.workerSid === utils.manager.workerClient.sid &&
      task.conference.liveParticipantCount <= 2
    ) {
      console.debug(
        "beforeHangupCall > Clean hangup and <= 2 participants, so ending conference",
        payload
      );
      ConferenceService.endConference(task.conference.conferenceSid);
    } else {
      console.debug(
        "beforeHangupCall > Clean hangup but > 2 participants, so letting the conference live on",
        payload
      );
    }
  });
}
