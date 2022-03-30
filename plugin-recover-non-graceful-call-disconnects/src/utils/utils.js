import { Actions, Manager, TaskHelper } from "@twilio/flex-ui";

class Utils {
  _manager = Manager.getInstance();

  get baseServerlessUrl() {
    return `https://${process.env.REACT_APP_SERVERLESS_DOMAIN}`;
  }

  fetchPostUrlEncoded = (body) => ({
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body),
  });

  get flexState() {
    return this._manager.store.getState().flex;
  }

  get loginHandler() {
    return this.flexState.session.loginHandler;
  }

  get userToken() {
    return this.flexState.session.ssoTokenPayload.token;
  }

  get manager() {
    return this._manager;
  }

  isIncomingTransfer(task) {
    return task.incomingTransferObject && task.incomingTransferObject;
  }

  isIncomingWarmTransfer(task) {
    return task.incomingTransferObject && task.incomingTransferObject.mode === "WARM";
  }

  getNextWorkerParticipantFromConference(conference) {
    return conference.participants.find((p) => p.participantType === "worker" && !p.isMyself);
  }

  getMyWorkerParticipantFromConference(conference) {
    return conference.participants.find((p) => p.isMyself && p.status == "joined");
  }

  isRecoveryPingTask(task) {
    return task.workflowName === "Recovery Ping";
  }
  
  isTaskActive(task) {
    const { sid: reservationSid, taskStatus } = task;
    if (taskStatus === "canceled") {
      return false;
    } else {
      return this._manager.workerClient.reservations.has(reservationSid);
    }
  }
  
  showReconnectDialog(message, messageDetail) {
    Actions.invokeAction("SetComponentState", {
      name: "ReconnectDialog",
      state: { isOpen: true, message, messageDetail },
    });
  }
  
  closeReconnectDialog() {
    Actions.invokeAction("SetComponentState", {
      name: "ReconnectDialog",
      state: { isOpen: false },
    });
  }
}

export default new Utils();
