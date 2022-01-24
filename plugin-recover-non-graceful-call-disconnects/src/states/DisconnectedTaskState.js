const ACTION_SET_DISCONNECTED_TASK = "SET_DISCONNECTED_TASK";
const ACTION_HANDLE_RECOVERY_PING = "HANDLE_RECOVERY_PING";
const ACTION_HANDLE_RECONNECT_SUCCESS = "HANDLE_RECONNECT_SUCCESS";

const initialState = {
  disconnectedTaskSid: undefined,
  isReconnected: false,
  isPingReceived: false
};

// Define plugin actions
export class DisconnectedTaskActions {
  static setDisconnectedTask = (taskSid) => ({
    type: ACTION_SET_DISCONNECTED_TASK,
    disconnectedTaskSid: taskSid,
  });
  static handleReconnectSuccess = () => ({
    type: ACTION_HANDLE_RECONNECT_SUCCESS,
  });
  static handleRecoveryPing = () => ({
    type: ACTION_HANDLE_RECOVERY_PING,
  });
}

// Define how actions influence state
export function reduce(state = initialState, action) {
  switch (action.type) {
    case ACTION_SET_DISCONNECTED_TASK:
      return {
        ...state,
        disconnectedTaskSid: action.disconnectedTaskSid,
      };
    case ACTION_HANDLE_RECONNECT_SUCCESS:
      return {
        ...state,
        isReconnected: true,
      };
    case ACTION_HANDLE_RECOVERY_PING:
      return {
        ...state,
        isPingReceived: true
      };
    default:
      return state;
  }
}
