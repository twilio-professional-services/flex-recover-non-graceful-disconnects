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
}

export default new Utils();
