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
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import Gio from 'gi://Gio';
import GObject from 'gi://Gobject';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';


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

const KeepScreenOnToggle = GObject.registerClass(
    class KeepScreenOnToggle extends QuickSettings.QuickToggle {
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
            this._objects = new Map();
            this._inhibitors = new Map();
            this._sessionManager = new DBusSessionManagerProxy(Gio.DBus.session, 'org.gnome.SessionManager', '/org/gnome/SessionManager');
            this._indicator = this._addIndicator();
            this._indicator.icon_name = IconName;
            this._indicator.visible = false;

            this._toggle = new KeepScreenOnToggle();
            this._toggle.connect('clicked', this.toggleState.bind(this));

            this.quickSettingsItems.push(this._toggle);

            this._inhibitorAddedId = this._sessionManager.connectSignal('InhibitorAdded', this._inhibitorAdded.bind(this));
            this._inhibitorRemovedId = this._sessionManager.connectSignal('InhibitorRemoved', this._inhibitorRemoved.bind(this));
        }

        toggleState() {
            if (this._state) {
                this.removeAllInhibitor();
            } else {
                this.addInhibitor('user');
            }
        }

        addInhibitor(inhibitorId) {
            if (!this._inhibitors.has(inhibitorId)) {
                this._sessionManager.InhibitRemote(inhibitorId,
                    0, 'Inhibit by %s'.format(IndicatorName), 12,
                    cookie => {
                        console.debug("Inhibitor: " + inhibitorId + ", cookie: " + cookie);
                        this._inhibitors.set(inhibitorId, cookie);
                    }
                );
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
                                this._toggle.checked = true;
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
                this._toggle.checked = false;
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

export default class KeepScreenOnExtension extends Extension {
    Toggle() {
        if (this._indicator) {
            this._indicator.toggleState();
        }
    }

    enable() {
        this._indicator = new Indicator();
        this._dbusImpl = Gio.DBusExportedObject.wrapJSObject(KeepScreenOnDBusIface, this);
        this._dbusImpl.export(Gio.DBus.session, '/dev/ramottamado/KeepScreenOn');

        Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);
    }

    disable() {
        this._indicator.quickSettingsItems.forEach(item => item.destroy());
        this._indicator.destroy();
        this._indicator = null;
        if (this._dbusImpl) this._dbusImpl.unexport();
    }
}