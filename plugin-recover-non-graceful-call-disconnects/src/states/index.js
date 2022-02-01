import { combineReducers } from "redux";
import {
  reduce as disconnectedTaskReducer,
  DisconnectedTaskActions,
} from "./DisconnectedTaskState";
export { DisconnectedTaskActions as DisconnectedTaskActions };

export const namespace = "flex-recover-non-graceful-disconnects";

export default combineReducers({
  conference: disconnectedTaskReducer,
});
