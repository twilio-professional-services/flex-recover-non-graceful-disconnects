import React from "react";
import { VERSION } from "@twilio/flex-ui";
import { FlexPlugin } from "flex-plugin";

//import reducers, { namespace } from './states';

import { utils } from "./utils";
import * as listeners from "./listeners";
import * as notifications from "./notifications";
import { ReconnectDialog } from "./components/ReconnectDialog";

const PLUGIN_NAME = "RecoverNonGracefulCallDisconnectsPlugin";
export default class RecoverNonGracefulCallDisconnectsPlugin extends FlexPlugin {
  constructor() {
    super(PLUGIN_NAME);
    require("log-prefix")(`<< ${PLUGIN_NAME} >>`);
    console.debug("baseServerlessUrl", utils.baseServerlessUrl);
  }

  /**
   * This code is run when your plugin is being started
   * Use this to modify any UI components or attach to the actions framework
   *
   * @param flex { typeof import('@twilio/flex-ui') }
   * @param manager { import('@twilio/flex-ui').Manager }
   */
  init(flex, manager) {
    this.registerReducers(manager);
    this.registerNotifications();
    this.registerListeners();
    this.initComponents(flex);
    // TODO: Upon non-graceful call disconnect by agent, show notification, block wrapup
    // TODO: Upon reservation created for the reconnect ping task, accept the task, and
    // complete immediately (TR workspace event listener will react to this and enqueue the stranded call)
  }

  /**
   * Registers the plugin reducers
   *
   * @param manager { Flex.Manager }
   */
  registerReducers(manager) {
    if (!manager.store.addReducer) {
      // eslint: disable-next-line
      console.error(
        `You need FlexUI > 1.9.0 to use built-in redux; you are currently on ${VERSION}`
      );
      return;
    }

    //    manager.store.addReducer(namespace, reducers);
  }

  /**
   * Registers the listeners
   */
  registerListeners() {
    listeners.reservationCreated();
    listeners.acceptTask();
    listeners.hangupCall();
  }

  /**
   * Register the notifications
   */
  registerNotifications() {
    notifications.customNotifications();
  }

  initComponents(flex) {
    flex.SideNav.Content.add(
      <ReconnectDialog key="reconnect-dialog" />,
      { sortOrder: 100 }
    );
  }
}
