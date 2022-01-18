import { Actions, Notifications, TaskHelper } from "@twilio/flex-ui";
import { ConferenceStateService } from "../services";

import { utils, Constants } from "../utils";

/**
 * Handles beforeTaskAccept and afterTaskAccept events for all voice tasks and ensures the status callback listener
 * is attached, and the state is recorded (e.g. to Sync map in our example - via serverless function)
 *
 */
export default function acceptTask() {
  Actions.addListener("beforeAcceptTask", (payload) => {
    console.debug("beforeAcceptTask", payload);

    const { task } = payload;

    if (
      TaskHelper.isCallTask(task) &&
      task.workerSid === utils.manager.workerClient.sid
    ) {
      // Set endconferenceonexit to false - to allow customer call to remain active/recovarable if agent
      // ends non-gracefully

      // EDIT: Commenting out because Flex later overwrites to true anyway after conference is started (as it sees
      // only 2 participants, and doesn't have the foresight to cater to our wild idea of leaving customer in conference
      // alone if agent drops unexpectedly)

      // payload.conferenceOptions.endConferenceOnExit = false;

      // TODO: statusCallback is a specific handler for call events for this participant, and could be useful for
      // deriving who worker is (vs customer)
      payload.conferenceOptions.conferenceStatusCallback = `${utils.baseServerlessUrl}/conference-status-handler`;
      payload.conferenceOptions.statusCallback = `${utils.baseServerlessUrl}/conference-status-handler`;
      payload.conferenceOptions.conferenceStatusCallbackEvent = "end,leave"; // We only really need end and leave
      console.debug("Conference Options", payload.conferenceOptions);

      // If this is a reconnect task, show the notification
      if (task.attributes?.isReconnect === true) {
        Notifications.showNotification(
          Constants.FlexNotification.reconnectSuccessful
        );
        Notifications.dismissNotificationById(Constants.FlexNotification.nonGracefulAgentDisconnect);
        Notifications.dismissNotificationById(Constants.FlexNotification.incomingReconnect);
      }
    }
  });
}
