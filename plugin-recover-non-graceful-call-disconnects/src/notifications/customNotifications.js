import {
  Notifications,
  NotificationType,
  TaskHelper,
  NotificationBar,
  Actions,
} from "@twilio/flex-ui";

import { utils, Constants } from "../utils";

export default function customNotifications() {
  const manager = utils.manager;

  manager.strings[Constants.FlexNotification.nonGracefulAgentDisconnect] =
    "A system issue or page refresh disconnected you from the conference. Reconnecting now...";

  manager.strings[Constants.FlexNotification.incomingReconnect] =
    "Ready to reconnect you to the conference now";

  Notifications.registerNotification({
    id: Constants.FlexNotification.nonGracefulAgentDisconnect,
    closeButton: true,
    content: Constants.FlexNotification.nonGracefulAgentDisconnect,
    type: NotificationType.warning,
    //timeout: 8000, // Want this to remain open
  });

  Notifications.registerNotification({
    id: Constants.FlexNotification.incomingReconnect,
    closeButton: true,
    content: Constants.FlexNotification.incomingReconnect,
    type: NotificationType.information,
    //timeout: 5000, // Want this to remain open
    actions: [
      <NotificationBar.Action
        onClick={(_, notification) => {
          Notifications.dismissNotification(notification);
          reconnectConference(notification.context.recoveryPingTask);
        }}
        label="Reconnect"
      />,
    ],
  });
}

// TODO: Put this somewhere better, like in a dispatch action
/**
 * Completes the disconnected call task (to free up agent for more calls), and completes the ping task too.
 *
 * @param {*} recoveryPingTask
 */
function reconnectConference(recoveryPingTask) {
  console.debug("reconnectConference", recoveryPingTask);
  const disconnectedTask = TaskHelper.getTaskByTaskSid(
    recoveryPingTask.attributes.disconnectedTaskSid
  );
  console.debug(`Completing the disconnected task ${disconnectedTask.sid}`);
  Actions.invokeAction("CompleteTask", {
    sid: disconnectedTask.sid,
  });
  console.debug(`Completing the ping task ${recoveryPingTask.sid}`);
  Actions.invokeAction("CompleteTask", {
    sid: recoveryPingTask.sid,
  });
}
