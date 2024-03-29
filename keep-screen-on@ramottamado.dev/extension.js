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

const QuickSettings = imports.ui.quickSettings;

const QuickSettingsMenu = imports.ui.main.panel.statusArea.quickSettings;

function addQuickSettingsItems(items) {
    // Add the items with the built-in function
    QuickSettingsMenu._addItems(items);

    // Ensure the tile(s) are above the background apps menu
    for (const item of items) {
        QuickSettingsMenu.menu._grid.set_child_below_sibling(item,
            QuickSettingsMenu._backgroundApps.quickSettingsItems[0]);
    }
}

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
    '          <arg type="o" />' +
    '      </signal>' +
    '      <signal name="InhibitorRemoved">' +
    '          <arg type="o" />' +
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

const QToggle = GObject.registerClass(
    class QToggle extends QuickSettings.QuickToggle {
        _init() {
            super._init({
                title: _('Keep Screen On'),
                iconName: IconName,
                toggleMode: true,
            });
        }
    }
)

const Indicator = GObject.registerClass(
    class Indicator extends QuickSettings.SystemIndicator {
        _init() {
            super._init();

            this._state = false;
            this._mprisNum = 0;
            this._objects = new Map();
            this._inhibitors = new Map();
            this._sessionManager = new DBusSessionManagerProxy(Gio.DBus.session, 'org.gnome.SessionManager', '/org/gnome/SessionManager');
            this._indicator = this._addIndicator();
            this._indicator.icon_name = IconName;
            this._indicator.visible = false;

            this._item = new QToggle();
            this._item.connect('clicked', this.toggleState.bind(this));

            this.quickSettingsItems.push(this._item);

            this.connect('destroy', () => {
                this.quickSettingsItems.forEach(item => item.destroy());
            });

            this._inhibitorAddedId = this._sessionManager.connectSignal('InhibitorAdded', this._inhibitorAdded.bind(this));
            this._inhibitorRemovedId = this._sessionManager.connectSignal('InhibitorRemoved', this._inhibitorRemoved.bind(this));

            QuickSettingsMenu._indicators.insert_child_at_index(this, 0);
            addQuickSettingsItems(this.quickSettingsItems);
        }

        toggleState() {
            if (this._state) {
                this.removeAllInhibitor();
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

        removeAllInhibitor() {
            this._inhibitors.forEach((value, key) => {
                try {
                    this._sessionManager.UninhibitRemote(value);
                } catch (err) {
                    //
                }

                this._inhibitors.delete(key);
            });
        }

        _inhibitorAdded(_proxy, _sender, [object]) {
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
                                this._item.checked = true;
                            }
                        }
                    });
                }
            });
        }

        _inhibitorRemoved(_proxy, _sender, [object]) {
            let inhibitorId = this._objects.get(object);

            if (!this._inhibitors.has(inhibitorId)) {
                this._objects.delete(object);
            }

            if (this._inhibitors.size === 0) {
                this._state = false;
                this._indicator.visible = false;
                this._item.checked = false;
            }
        }

        destroy() {
            // remove all inhibitors
            this.removeAllInhibitor();

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