import { Actions, TaskHelper } from "@twilio/flex-ui";
import { ConferenceService, ConferenceStateService } from "../services";

import { utils } from "../utils";

/**
 * Handles beforeHangupCall and ends conference if only 2 or fewer participants
 * (saves need to update endConferenceOnExit flag to true for the agent, and potential latency around
 * that particular update taking effect)
 *
 */
export default function hangupCall() {
  Actions.addListener("beforeHangupCall", async (payload) => {
    console.debug("beforeHangupCall", payload);

    const { task } = payload;

    console.debug("beforeHangupCall > task.conference", task.conference);

    if (
      TaskHelper.isCallTask(task) &&
      task.workerSid === utils.manager.workerClient.sid
    ) {
      // Store (in backend) the fact that this was a graceful disconnect
      // Our conference status callback handler can consequently ignore the agent participant-leave event
      await ConferenceStateService.setGracefulDisconnect(
        task.conference.conferenceSid,
        utils.manager.workerClient.sid
      );

      if (task.conference.liveParticipantCount <= 2) {
        console.debug(
          "beforeHangupCall > Clean hangup and <= 2 participants, so ending conference",
          payload
        );
        await ConferenceService.endConference(task.conference.conferenceSid);
      } else {
        console.debug(
          "beforeHangupCall > Clean hangup but > 2 participants, so letting the conference live on",
          payload
        );
      }
    }
  });
}
