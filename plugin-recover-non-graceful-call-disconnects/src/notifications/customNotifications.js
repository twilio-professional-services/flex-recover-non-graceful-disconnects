import {
  Notifications,
  NotificationType,
  NotificationBar,
  Actions,
} from "@twilio/flex-ui";

import { utils, Constants } from "../utils";

export default function customNotifications() {
  const manager = utils.manager;

  manager.strings[Constants.FlexNotification.incomingReconnectTaskFromOtherWorker] =
    `Incoming call is a RECONNECT due to agent, {{disconnectedWorkerName}}, having system issues at {{disconnectedTime}}`;

  Notifications.registerNotification({
    id: Constants.FlexNotification.incomingReconnectTaskFromOtherWorker,
    closeButton: true,
    content: Constants.FlexNotification.incomingReconnectTaskFromOtherWorker,
    type: NotificationType.warning,
    timeout: 5000, 
    icon: "ConnectionError",
  });

}
