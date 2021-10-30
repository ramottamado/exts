/* exported enable disable init */
/**
    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 2 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
**/

'use strict';

const { Atk, Gio, GObject, Shell, St } = imports.gi;
const Main = imports.ui.main;
const Mainloop = imports.mainloop;
const PanelMenu = imports.ui.panelMenu;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const DBusSessionManagerIface = '<node>\
  <interface name="org.gnome.SessionManager">\
    <method name="Inhibit">\
        <arg type="s" direction="in" />\
        <arg type="u" direction="in" />\
        <arg type="s" direction="in" />\
        <arg type="u" direction="in" />\
        <arg type="u" direction="out" />\
    </method>\
    <method name="Uninhibit">\
        <arg type="u" direction="in" />\
    </method>\
       <method name="GetInhibitors">\
           <arg type="ao" direction="out" />\
       </method>\
    <signal name="InhibitorAdded">\
        <arg type="o" direction="out" />\
    </signal>\
    <signal name="InhibitorRemoved">\
        <arg type="o" direction="out" />\
    </signal>\
  </interface>\
</node>';

const DBusSessionManagerProxy = Gio.DBusProxy.makeProxyWrapper(DBusSessionManagerIface);

const DBusSessionManagerInhibitorIface = '<node>\
  <interface name="org.gnome.SessionManager.Inhibitor">\
    <method name="GetAppId">\
        <arg type="s" direction="out" />\
    </method>\
  </interface>\
</node>';

const DBusSessionManagerInhibitorProxy = Gio.DBusProxy.makeProxyWrapper(DBusSessionManagerInhibitorIface);

const IndicatorName = 'Caffeine';
const DisabledIcon = 'my-caffeine-off-symbolic';
const EnabledIcon = 'my-caffeine-on-symbolic';

let CaffeineIndicator;

const Caffeine = GObject.registerClass(
    class Caffeine extends PanelMenu.Button {
        _init() {
            super._init(null, IndicatorName);

            this.accessible_role = Atk.Role.TOGGLE_BUTTON;

            this._sessionManager = new DBusSessionManagerProxy(Gio.DBus.session,
                'org.gnome.SessionManager',
                '/org/gnome/SessionManager');
            this._inhibitorAddedId = this._sessionManager.connectSignal('InhibitorAdded', this._inhibitorAdded.bind(this));
            this._inhibitorRemovedId = this._sessionManager.connectSignal('InhibitorRemoved', this._inhibitorRemoved.bind(this));

            // ("screen" in global) is false on 3.28, although global.screen exists
            if (typeof global.screen !== 'undefined') {
                this._screen = global.screen;
                this._display = this._screen.get_display();
            } else {
                this._screen = global.display;
                this._display = this._screen;
            }

            this._icon = new St.Icon({
                style_class: 'system-status-icon',
            });

            this._icon.gicon = Gio.icon_new_for_string(`${Me.path}/icons/${DisabledIcon}.svg`);

            this._state = false;

            this._cookie = '';
            this._inhibitorId = '';

            this._inhibitorIds = [];
            this._cookies = [];
            this._objects = [];

            this.add_actor(this._icon);
            this.add_style_class_name('panel-status-button');
            this.connect('button-press-event', this.toggleState.bind(this));
            this.connect('touch-event', this.toggleState.bind(this));

            this._inFullscreenId = this._screen.connect('in-fullscreen-changed', this.toggleFullscreen.bind(this));
            this.toggleFullscreen();
        }

        get inFullscreen() {
            let nbMonitors = this._screen.get_n_monitors();
            let inFullscreen = false;
            for (let i = 0; i < nbMonitors; i++) {
                if (this._screen.get_monitor_in_fullscreen(i)) {
                    inFullscreen = true;
                    break;
                }
            }
            return inFullscreen;
        }

        toggleFullscreen() {
            Mainloop.timeout_add_seconds(2, () => {
                if (this.inFullscreen) {
                    this.addInhibit('fullscreen');
                }
            });

            if (!this.inFullscreen) {
                this.removeInhibit('fullscreen');
            }
        }

        toggleState() {
            if (this._state) {
                this.removeInhibit('user');
            } else {
                this.addInhibit('user');
            }
        }

        addInhibit(inhibitorId) {
            this._sessionManager.InhibitRemote(inhibitorId,
                0, 'Inhibit by %s'.format(IndicatorName), 12,
                cookie => {
                    this._cookie = cookie;
                    this._inhibitorId = inhibitorId;
                }
            );
        }

        removeInhibit(inhibitorId) {
            let index = this._inhibitorIds.indexOf(inhibitorId);
            this._sessionManager.UninhibitRemote(this._cookies[index]);
        }

        _inhibitorAdded(proxy, sender, [object]) {
            this._sessionManager.GetInhibitorsRemote(([inhibitors]) => {
                for (let i of inhibitors) {
                    let inhibitor = new DBusSessionManagerInhibitorProxy(Gio.DBus.session,
                        'org.gnome.SessionManager',
                        i);

                    inhibitor.GetAppIdRemote(inhibitorId => {
                        inhibitorId = String(inhibitorId);

                        if (inhibitorId !== '' && inhibitorId === this._inhibitorId) {
                            this._inhibitorIds.push(this._inhibitorId);
                            this._cookies.push(this._cookie);
                            this._objects.push(object);
                            this._inhibitorId = '';
                            this._cookie = '';

                            if (this._state === false) {
                                this._state = true;
                                this._icon.gicon = Gio.icon_new_for_string(`${Me.path}/icons/${EnabledIcon}.svg`);
                            }
                        }
                    });
                }
            });
        }

        _inhibitorRemoved(proxy, sender, [object]) {
            let index = this._objects.indexOf(object);

            if (index !== -1) {
                this._inhibitorIds.splice(index, 1);
                this._cookies.splice(index, 1);
                this._objects.splice(index, 1);

                if (this._inhibitorIds.length === 0) {
                    this._state = false;
                    this._icon.gicon = Gio.icon_new_for_string(`${Me.path}/icons/${DisabledIcon}.svg`);
                }
            }
        }

        destroy() {
            // remove all inhibitors
            this._inhibitorIds.forEach(inhibitorId => this.removeInhibit(inhibitorId));

            // disconnect from signals
            this._screen.disconnect(this._inFullscreenId);

            if (this._inhibitorAddedId) {
                this._sessionManager.disconnectSignal(this._inhibitorAddedId);
                this._inhibitorAddedId = 0;
            }

            if (this._inhibitorRemovedId) {
                this._sessionManager.disconnectSignal(this._inhibitorRemovedId);
                this._inhibitorRemovedId = 0;
            }

            super.destroy();
        }
    });

function init() {
    // Empty
}

function enable() {
    CaffeineIndicator = new Caffeine();
    Main.panel.addToStatusArea(IndicatorName, CaffeineIndicator);
}

function disable() {
    CaffeineIndicator.destroy();
    CaffeineIndicator = null;
}