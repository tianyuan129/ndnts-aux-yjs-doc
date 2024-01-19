import memdown from "memdown";
import yargs from "yargs/yargs";
import {
    ECDSA,
    generateSigningKey,
    type KeyChain,
    RSA,
    SigningAlgorithm,
  } from "@ndn/keychain";
import { FwTracer } from "@ndn/fw";
import { Name } from "@ndn/packet";
import { Endpoint } from "@ndn/endpoint";
import { openKeyChain } from "@ndn/cli-common";
import { NdnSvsAdaptor } from "@ucla-irl/ndnts-aux";
// import { SyncAgent } from "@ucla-irl/ndnts-aux";
import { getSafeBag } from "./keychain-bypass.ts";
import { WsConnectMgr } from "./connect.ts";

export const endpoint: Endpoint = new Endpoint()
export const keyChain: KeyChain = openKeyChain();
export const UseAutoAnnouncement = false

async function bootstrap(certname: string, passphrase: string) {
    await openKeyChain();
    const safebag = await getSafeBag(certname, passphrase)
    const algoList: SigningAlgorithm[] = [ECDSA, RSA];
    const [algo, key] = await safebag.certificate.importPublicKey(algoList);
    const pkcs8 = await safebag.decryptKey(passphrase);
    const [nfdSigner, _] = await generateSigningKey(safebag.certificate.name, algo, { importPkcs8: [pkcs8, key.spki] });
    return [nfdSigner, safebag.certificate]
}
// ============= Connectivity =============
const run = async () => {
  let nfdCmdSigner, nfdCertificate, face, wsConn
  [nfdCmdSigner, nfdCertificate] = await bootstrap("/workspace/keychain/KEY/yq%23%5D%D4%DA%81%A0/self/v=1703026076932", "PASSPHRASE")
  try {
    wsConn = new WsConnectMgr(new Name("/nodeId"), endpoint, new Name("/appPrefix"),
                              nfdCmdSigner, nfdCertificate,
                              "wss://icear.cs.ucla.edu/ws/")
    face = await wsConn.wsConnect()
    if (face === undefined) {
      throw new Error('Face is nil')
    }
  } catch (err) {
    console.error('Failed to connect:', err)
    wsConn?.wsDisconnect()
    return
  }
};

if (import.meta.main) {
//   const parser = yargs(Deno.args).options({
//     caCertName: { type: "string" },
//     maxValidity: { type: "number", default: 86400000 * 30 },
//     repoName: { type: "string" },
//     oidcId: { type: "string" },
//     oidcSecret: { type: "string" },
//   });

  FwTracer.enable();
//   const argv = await parser.argv;
  const server = await run();
  Deno.addSignalListener("SIGINT", () => {
    console.log("Stopped by Ctrl+C");
    Deno.exit();
  });
}