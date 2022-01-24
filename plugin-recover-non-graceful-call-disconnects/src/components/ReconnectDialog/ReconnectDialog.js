import * as React from "react";
import { connect } from "react-redux";
import { Actions, withTheme } from "@twilio/flex-ui";
//import { namespace } from '../../state';
import Dialog from "@material-ui/core/Dialog";
import DialogContent from "@material-ui/core/DialogContent";
import DialogContentText from "@material-ui/core/DialogContentText";
import { Constants, utils } from "../../utils";

const manager = utils.manager;

class ReconnectDialog extends React.Component {
  //workerListener = undefined;

  constructor(props) {
    super(props);
    //this.workerListener = WorkerListener.create();
  }

  state = {};

  componentDidMount() {
    //this.workerListener.workersSearch();
  }

  componentDidUpdate() {}

  componentWillUnmount() {
    //this.workerListener.unsubscribe();
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

  handleChange = (e) => {
    // const value = e.target.value;
    // console.log('Selected Worker: ', value);
    // this.setState({ selectedWorker: value });
  };

  render() {
    return (
      <Dialog
        open={this.props.isOpen || false}
        onClose={this.handleClose}
        disableEscapeKeyDown
      >
        <DialogContent>
          <DialogContentText>{this.props.message}</DialogContentText>
          
          <DialogContentText>{Constants.SLOW_MODE && <br/>}</DialogContentText>

          <DialogContentText>{Constants.SLOW_MODE && "** DEMO MODE: DELAYS ARE INTENDED **"}</DialogContentText>

        </DialogContent>
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
