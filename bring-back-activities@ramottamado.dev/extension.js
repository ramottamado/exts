/**
 * GNOME Shell extension to bring back the Activities button.
 *
 **/

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import Clutter from 'gi://Clutter';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export default class BringBackActivitiesButtonExtension extends Extension {
  enable() {
    // Destroy Overview Indicator
    this._activitiesButton = Main.panel.statusArea["activities"];
    this._activitiesButtonChildren = this._activitiesButton.get_children();

    this._activitiesLabel = new St.Label({
      text: this._activitiesButton.accessible_name,
      y_align: Clutter.ActorAlign.CENTER,
    });

    this._activitiesButtonChildren.map(child => {
      this._activitiesButton.remove_child(child);
    });

    this._activitiesButton.add_actor(this._activitiesLabel);
    this._activitiesButton.label_actor = this._activitiesLabel;
  }

  disable() {
    this._activitiesButton.label_actor = null;
    this._activitiesButton.remove_actor(this._activitiesLabel);

    this._activitiesButtonChildren.map(child => {
      this._activitiesButton.add_child(child);
    });

    this._activitiesLabel.destroy();
    this._activitiesButtonChildren = null;
    this._activitiesButton = null;
  }
}
