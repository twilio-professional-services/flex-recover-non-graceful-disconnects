import { Actions, TaskHelper } from "@twilio/flex-ui";
import { ConferenceStateService } from "../services";

import { utils } from "../utils";

/**
 * Handles beforeTransferTask and sets graceful disconnect flag if it's a cold transfer
 *
 */
export default function transferTask() {
  Actions.addListener("beforeTransferTask", async (payload) => {

    const { task, options } = payload;

    console.debug("beforeTransferTask > payload", payload);

    if (
      TaskHelper.isCallTask(task) &&
      options.mode === "COLD"
    ) {
      // Remove this worker from backend state model
      // Our conference status callback handler can consequently ignore the agent participant-leave event
      await ConferenceStateService.removeWorker(
        task.conference.conferenceSid,
        utils.manager.workerClient.sid
      );     
    }
  });
}
