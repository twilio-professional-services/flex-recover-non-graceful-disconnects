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
    "A system issue or page refresh disconnected you from the vehicle. Attempting to reconnect...";

  manager.strings[Constants.FlexNotification.incomingReconnect] =
    'Ready to reconnect to vehicle. Click "Reconnect" to join the call';

  manager.strings[Constants.FlexNotification.reconnectSuccessful] =
    "Connection restored with vehicle";

  Notifications.registerNotification({
    id: Constants.FlexNotification.nonGracefulAgentDisconnect,
    closeButton: true,
    content: Constants.FlexNotification.nonGracefulAgentDisconnect,
    type: NotificationType.error,
    timeout: 0, // Want this to remain open til dimissed
    icon: "ConnectionError",
  });

  Notifications.registerNotification({
    id: Constants.FlexNotification.incomingReconnect,
    closeButton: true,
    content: Constants.FlexNotification.incomingReconnect,
    type: NotificationType.warning,
    icon: "IncomingCall",
    timeout: 0, // Want this to remain open
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

  Notifications.registerNotification({
    id: Constants.FlexNotification.reconnectSuccessful,
    closeButton: true,
    content: Constants.FlexNotification.reconnectSuccessful,
    type: NotificationType.success,
    timeout: 8000, // Want this to disappear
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

  console.debug(`Completing the ping task ${recoveryPingTask.sid}`);
  Actions.invokeAction("CompleteTask", {
    sid: recoveryPingTask.sid,
  });

  // Note: the currently wrapping call task (the disconnected one) will be completed by means of
  // an event listener on the backend, in response to the ping task being completed
  // This is to eliminate risk of another call task being reserved to agent, as it allows the new
  // reconnect task to reach the task queue before completing the original one.
}
