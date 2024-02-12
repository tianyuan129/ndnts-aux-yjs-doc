import { FwFace } from "@ndn/fw";
import * as nfdmgmt from "@ndn/nfdmgmt";
import { Certificate } from "@ndn/keychain";
import { Name, type Signer} from "@ndn/packet";
import { Endpoint, Producer  } from "@ndn/endpoint";
import { WsTransport } from "@ndn/ws-transport"

let nfdCertProducer: Producer | undefined
let commandPrefix = nfdmgmt.localhopPrefix
export const UseAutoAnnouncement = false

export class WsConnectMgr {
    protected _nfdWsFace: FwFace | undefined
    protected _isLocal = false
  
    constructor(
      readonly nodeId: Name,
      readonly endpoint: Endpoint,
      readonly appPrefix: Name,
      readonly nfdCmdSigner: Signer,
      readonly nfdCertificate: Certificate,
      readonly wsUrl: string
    ) {}
    async wsConnect() {
        if (this._nfdWsFace !== undefined) {
            console.error('Try to connect to an already connected WebSocket face')
            return
        }
        // Force ndnts to register the prefix correctly using localhost
        // SA: https://redmine.named-data.net/projects/nfd/wiki/ScopeControl#local-face
        this._nfdWsFace = await WsTransport.createFace({ l3: { local: this._isLocal } }, this.wsUrl)
        // The automatic announcement is turned off by default to gain a finer control.
        // See checkPrefixRegistration for details.
        nfdmgmt.enableNfdPrefixReg(this._nfdWsFace, { signer: this.nfdCmdSigner })
        commandPrefix = nfdmgmt.getPrefix(this._isLocal)
        await this.checkPrefixRegistration(false)
        return this._nfdWsFace
    }
    wsDisconnect() {
        if (this._nfdWsFace === undefined) {
            console.error('Try to disconnect from a non-existing WebSocket face')
            return
        }
        this._nfdWsFace.close()
        this._nfdWsFace = undefined
    }

    async checkPrefixRegistration(cancel: boolean) {
        if (cancel && this._nfdWsFace !== undefined) {
          if (!UseAutoAnnouncement) {
            // Unregister prefixes
            await nfdmgmt.invoke("rib/unregister", {
              name: this.nodeId!,
              origin: 65,  // client
            }, {
              endpoint: this.endpoint,
              prefix: commandPrefix,
              signer: this.nfdCmdSigner,
            })
            await nfdmgmt.invoke("rib/unregister", {
              name: this.appPrefix!,
              origin: 65,  // client
            }, {
              endpoint: this.endpoint,
              prefix: commandPrefix,
              signer: this.nfdCmdSigner,
            })
      
            // Stop serving certificate
            nfdCertProducer?.close()
            nfdCertProducer = undefined
          }
        } else if (!cancel && this._nfdWsFace !== undefined) {
          // Note: UseAutoAnnouncement works, the following code is kept for test.
          // Differences:
          // - UseAutoAnnouncement does not cut the connection and notify the user when he uses
          //   an invalid certificate to connect to a testbed node.
          // - UseAutoAnnouncement will announce sync prefixes
          if (!UseAutoAnnouncement) {
            // Serve the certificate back to the forwarder
            if (nfdCertProducer) {
              console.error(`[FATAL] There should only be one transport running.`)
              nfdCertProducer?.close()
            }
            if (this.nfdCertificate) {
              nfdCertProducer = this.endpoint.produce(this.nfdCertificate.name, async () => this.nfdCertificate?.data)
            }
            // Register prefixes
            const cr = await nfdmgmt.invoke("rib/register", {
              name: this.appPrefix!,
              origin: 65,  // client
              cost: 0,
              flags: 0x02,  // CAPTURE
            }, {
              endpoint: this.endpoint,
              prefix: commandPrefix,
              signer: this.nfdCmdSigner,
            })
            if (cr.statusCode !== 200) {
              window.alert(`Unable to register route: ${cr.statusCode} ${cr.statusText}`)
              // Cut connection
              return this.wsDisconnect()
            }
            const cr2 = await nfdmgmt.invoke("rib/register", {
              name: this.nodeId!,
              origin: 65,  // client
              cost: 0,
              flags: 0x02,  // CAPTURE
            }, {
              endpoint: this.endpoint,
              prefix: commandPrefix,
              signer: this.nfdCmdSigner,
            })
            if (cr2.statusCode !== 200) {
              window.alert(`Unable to register route: ${cr2.statusCode} ${cr2.statusText}`)
              // Cut connection
              return this.wsDisconnect()
            }
          }
        }
    }
}