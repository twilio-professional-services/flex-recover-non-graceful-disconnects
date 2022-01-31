import * as React from "react";
import { connect } from "react-redux";
import { Actions, withTheme } from "@twilio/flex-ui";
//import { namespace } from '../../state';
import { Dialog, DialogContent, DialogContentText } from "@material-ui/core";
import { Constants, utils } from "../../utils";
import { ReconnectDialogStyles } from "./ReconnectDialog.style";

const manager = utils.manager;

class ReconnectDialog extends React.Component {

  constructor(props) {
    super(props);
  }

  state = {};

  componentDidMount() {
  }

  componentDidUpdate() {}

  componentWillUnmount() {
  }

  handleClose = (event, reason) => {
    if (reason !== "backdropClick") {
      this.closeDialog();
    }
  };

  closeDialog = () => {
    Actions.invokeAction("SetComponentState", {
      name: "ReconnectDialog",
      state: { isOpen: false },
    });
  };


  render() {
    return (
      <Dialog
        open={this.props.isOpen || false}
        onClose={this.handleClose}
        disableEscapeKeyDown
      >
        <ReconnectDialogStyles>
          <DialogContent>
            <div className="Twilio dialog-text">{this.props.message}</div>
            
            <div className="Twilio dialog-text-demo-note">{Constants.SLOW_MODE && "** DEMO MODE: DELAYS ARE INTENDED **"}</div>

          </DialogContent>
        </ReconnectDialogStyles>
      </Dialog>
    );
  }
}

const mapStateToProps = (state) => {
  const componentViewStates = state.flex.view.componentViewStates;
  const reconnectDialogState =
    componentViewStates && componentViewStates.ReconnectDialog;
  const isOpen = reconnectDialogState && reconnectDialogState.isOpen;
  const message = reconnectDialogState && reconnectDialogState.message;

  return {
    isOpen,
    message,
  };
};

export default connect(mapStateToProps)(withTheme(ReconnectDialog));
