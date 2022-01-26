/**
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Author: Tamado Sitohang <ramot@ramottamado.dev>
 *         Jean-Philippe Braun <eon@patapon.info>
 * Based on caffeine GNOME shell extension from: Jean-Philippe Braun <eon@patapon.info>
 */

/* exported init */

'use strict';

const { Gio, GObject, Shell, St } = imports.gi;
const Main = imports.ui.main;
const Mainloop = imports.mainloop;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const AggregateMenu = Main.panel.statusArea.aggregateMenu;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const DBusSessionManagerIface =
    '<node>' +
    '   <interface name="org.gnome.SessionManager">' +
    '      <method name="Inhibit">' +
    '          <arg type="s" direction="in" />' +
    '          <arg type="u" direction="in" />' +
    '          <arg type="s" direction="in" />' +
    '          <arg type="u" direction="in" />' +
    '          <arg type="u" direction="out" />' +
    '      </method>' +
    '      <method name="Uninhibit">' +
    '          <arg type="u" direction="in" />' +
    '      </method>' +
    '      <method name="GetInhibitors">' +
    '          <arg type="ao" direction="out" />' +
    '      </method>' +
    '      <signal name="InhibitorAdded">' +
    '          <arg type="o" direction="out" />' +
    '      </signal>' +
    '      <signal name="InhibitorRemoved">' +
    '          <arg type="o" direction="out" />' +
    '      </signal>' +
    '   </interface>' +
    '</node>';

const DBusSessionManagerProxy = Gio.DBusProxy.makeProxyWrapper(DBusSessionManagerIface);

const DBusSessionManagerInhibitorIface =
    '<node>' +
    '   <interface name="org.gnome.SessionManager.Inhibitor">' +
    '       <method name="GetAppId">' +
    '           <arg type="s" direction="out" />' +
    '       </method>' +
    '   </interface>' +
    '</node>';

const DBusSessionManagerInhibitorProxy = Gio.DBusProxy.makeProxyWrapper(DBusSessionManagerInhibitorIface);

const KeepScreenOnDBusIface =
    '<node>' +
    '   <interface name="dev.ramottamado.KeepScreenOn">' +
    '       <method name="Toggle" />' +
    '   </interface>' +
    '</node>';

const IndicatorName = 'KeepScreenOn';
const IconName = 'preferences-desktop-display-symbolic';

const Indicator = GObject.registerClass(
    class Indicator extends PanelMenu.SystemIndicator {
        _init() {
            super._init();

            this._state = false;

            this._fullscreenNum = 0;

            this._objects = new Map();
            this._inhibitors = new Map();

            this._sessionManager = new DBusSessionManagerProxy(Gio.DBus.session, 'org.gnome.SessionManager', '/org/gnome/SessionManager');

            // ("screen" in global) is false on 3.28, although global.screen exists
            if (typeof global.screen !== 'undefined') {
                this._screen = global.screen;
                this._display = this._screen.get_display();
            } else {
                this._screen = global.display;
                this._display = this._screen;
            }

            this._indicator = this._addIndicator();
            this._indicator.icon_name = IconName;
            this._indicator.visible = false;

            this._item = new PopupMenu.PopupSubMenuMenuItem(_('Keep Screen On'), true);
            this._item.icon.icon_name = IconName;

            this._toggleItem = new PopupMenu.PopupMenuItem('Enable');
            this._toggleItem.connect('activate', this.toggleState.bind(this));
            this._item.menu.addMenuItem(this._toggleItem);

            this.menu.addMenuItem(this._item);

            AggregateMenu._indicators.insert_child_at_index(this, 0);
            AggregateMenu._keepScreenOn = this;

            // Find current index of system menu
            const menuItems = AggregateMenu.menu._getMenuItems();
            const systemMenuIndex = menuItems.indexOf(AggregateMenu._system.menu);
            const menuIndex = systemMenuIndex > -1 ? systemMenuIndex : 12;

            // Place our menu before the system menu
            AggregateMenu.menu.addMenuItem(this.menu, menuIndex - 2);

            this._inhibitorAddedId = this._sessionManager.connectSignal('InhibitorAdded', this._inhibitorAdded.bind(this));
            this._inhibitorRemovedId = this._sessionManager.connectSignal('InhibitorRemoved', this._inhibitorRemoved.bind(this));
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
            let fullscreenInhibitors = Array.from(this._inhibitors.keys())
                .filter(x => x.startsWith('fullscreen'));

            fullscreenInhibitors.forEach(x => {
                log(x);
            });

            Mainloop.timeout_add_seconds(2, () => {
                if (this.inFullscreen && fullscreenInhibitors.length < 1) {
                    if (this._fullscreenNum === (Number.MAX_SAFE_INTEGER - 1)) {
                        this._fullscreenNum = 0;
                    }

                    this.addInhibit('fullscreen-' + this._fullscreenNum.toString());

                    this._fullscreenNum = this._fullscreenNum + 1;
                }
            });

            if (!this.inFullscreen && fullscreenInhibitors.length > 0) {
                fullscreenInhibitors.forEach(inhibitor => {
                    this.removeInhibit(inhibitor);
                });
            }
        }

        toggleState() {
            if (this._state) {
                this.removeInhibit('user', -1);
            } else {
                this.addInhibit('user');
            }
        }

        addInhibit(inhibitorId) {
            if (!this._inhibitors.has(inhibitorId)) {
                this._sessionManager.InhibitRemote(inhibitorId,
                    0, 'Inhibit by %s'.format(IndicatorName), 12,
                    cookie => {
                        log("Inhibitor: " + inhibitorId + ", cookie: " + cookie);
                        this._inhibitors.set(inhibitorId, cookie);
                    }
                );
            }
        }

        removeInhibit(inhibitorId) {
            if (this._inhibitors.has(inhibitorId)) {
                let cookie = this._inhibitors.get(inhibitorId);

                try {
                    this._sessionManager.UninhibitRemote(cookie);
                } catch (err) {
                    //
                }

                this._inhibitors.delete(inhibitorId);
            }
        }

        _inhibitorAdded(proxy, sender, [object]) {
            this._sessionManager.GetInhibitorsRemote(([inhibitors]) => {
                for (let inhibitor of inhibitors) {
                    let remoteInhibitor = new DBusSessionManagerInhibitorProxy(
                        Gio.DBus.session,
                        'org.gnome.SessionManager',
                        inhibitor
                    );

                    remoteInhibitor.GetAppIdRemote(inhibitorId => {
                        inhibitorId = String(inhibitorId);

                        if (inhibitorId !== '' && this._inhibitors.has(inhibitorId)) {
                            this._objects.set(object, inhibitorId);

                            if (this._state === false) {
                                this._state = true;
                                this._indicator.visible = true;
                                this._toggleItem.label.text = "Disable";
                            }
                        }
                    });
                }
            });
        }

        _inhibitorRemoved(proxy, sender, [object]) {
            let inhibitorId = this._objects.get(object);

            if (!this._inhibitors.has(inhibitorId)) {
                this._objects.delete(object);
            }

            if (this._inhibitors.size === 0) {
                this._state = false;
                this._indicator.visible = false;
                this._toggleItem.label.text = "Enable";
            }
        }

        destroy() {
            // remove all inhibitors
            this._inhibitors.forEach((cookie, inhibitor) => {
                this.removeInhibit(inhibitor);
            });

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

            this._item.destroy();
            this.menu.destroy();

            delete AggregateMenu._keepScreenOn;

            super.destroy();
        }
    });

class KeepScreenOn {
    constructor() {
        this._indicator = null;
        this._dbusImpl = Gio.DBusExportedObject.wrapJSObject(KeepScreenOnDBusIface, this);
    }

    Toggle() {
        if (this._indicator) {
            this._indicator.toggleState();
        }
    }

    enable() {
        this._indicator = new Indicator();
        this._dbusImpl.export(Gio.DBus.session, '/dev/ramottamado/KeepScreenOn');
    }

    disable() {
        this._indicator.destroy();
        this._indicator = null;
        if (this._dbusImpl) this._dbusImpl.unexport();
    }
}

function init() {
    return new KeepScreenOn();
}