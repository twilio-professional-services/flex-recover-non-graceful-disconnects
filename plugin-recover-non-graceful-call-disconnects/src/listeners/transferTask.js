import { Actions, TaskHelper } from "@twilio/flex-ui";
import { ConferenceStateService } from "../services";

import { utils } from "../utils";

/**
 * Handles beforeTransferTask and clears down the conference state for next agent to then populate
 *
 */
export default function transferTask() {
  Actions.addListener("beforeTransferTask", async (payload) => {
    console.debug("beforeTransferTask", payload);

    const { task } = payload;

    console.debug("beforeTransferTask > task.conference", task.conference);

    if (
      TaskHelper.isCallTask(task) &&
      task.workerSid === utils.manager.workerClient.sid
    ) {
      // Clear active conference state and prepare it for next agent to populate
      await ConferenceStateService.clearActiveConference(
        task.conference.conferenceSid
      );
    }
  });
}
