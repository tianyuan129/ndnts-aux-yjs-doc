import { DenoKvStorage, InMemoryStorage } from '@ucla-irl/ndnts-aux/storage';
import { Workspace } from '@ucla-irl/ndnts-aux/workspace';
import { base64ToBytes } from '@ucla-irl/ndnts-aux/utils';
import { CertStorage } from '@ucla-irl/ndnts-aux/security';
import { Endpoint } from '@ndn/endpoint';
import { Decoder } from '@ndn/tlv';
import { Data, Name } from '@ndn/packet';
import { Certificate } from '@ndn/keychain';
import { SafeBag } from '@ndn/ndnsec';
import { FwTracer } from '@ndn/fw';
import * as Y from 'yjs';
import yargs from "yargs/yargs";
import { WsConnectMgr } from "./connect.ts";
import { TcpServer } from "./tcp-server.ts";

const TRUST_ANCHOR = `
Bv0BPQc0CA1uZG4td29ya3NwYWNlCAR0ZXN0CANLRVkICFJS7LZ8gfUFCARzZWxm
NggAAAGLZIrN/xQJGAECGQQANu6AFVswWTATBgcqhkjOPQIBBggqhkjOPQMBBwNC
AATxuBAe/TYwLQ9e8Zt4cEXW1NPYAW3uooS+ZXTWeqLaXWF8Rlj4CzVzX8SPYiV8
peenggFj5b3qEuMiBPlDQblvFlUbAQMcJgckCA1uZG4td29ya3NwYWNlCAR0ZXN0
CANLRVkICFJS7LZ8gfUF/QD9Jv0A/g8yMDIzMTAyNVQwMTU1MDD9AP8PMjA0MzEw
MjBUMDE1NTAwF0YwRAIgRWW2rafR0vHSsA7uAeb78nSFUPxO0gAwl9KKMzJwuJgC
IEi9gc1gaM3/GYatfQUytQhvOnFxEEnWx+q4MxK7+Knh
`;

const SAFEBAG = `
gP0CSwb9AVYHPAgNbmRuLXdvcmtzcGFjZQgEdGVzdAgGbm9kZS0yCANLRVkICG0T
2mtJZDFWCARyb290NggAAAGLZJoxgRQJGAECGQQANu6AFVswWTATBgcqhkjOPQIB
BggqhkjOPQMBBwNCAATvyM+YO9/RWllBkDkr/Pu/TCZMiEDY6H7rkwoHhU267LdH
+XM4HgavvQcU7/kQx0SMPzFlKl1cBRHgami6C9+XFmUbAQMcNgc0CA1uZG4td29y
a3NwYWNlCAR0ZXN0CANLRVkICFJS7LZ8gfUFCARzZWxmNggAAAGLZIrN//0A/Sb9
AP4PMjAyMzEwMjVUMDIxMTQ5/QD/DzIwMjQxMDI0VDAyMTE0OBdHMEUCIC4AvX8F
Q19e+08fUvL6+UcLMhtcsbRlcX/VA4b+0uRxAiEAhEHYzYBBBNOCH7LelcwJ12f+
amtgBvXaTSAjmWA4CWuB7zCB7DBXBgkqhkiG9w0BBQ0wSjApBgkqhkiG9w0BBQww
HAQIfAcyXQiSbSgCAggAMAwGCCqGSIb3DQIJBQAwHQYJYIZIAWUDBAEqBBAeVjub
zfiRo/JfPmnW0bS9BIGQ183XD0RmcyNdxMzJtXKiNY12ST1G2Em5DfYHtWueywdI
xIr0U+no8kchpCABShtoz9aqFb5TgEmbevYavyFbF5P3byqK36jELjuAvVaJAQRl
fnI+BXFXipCPj8vqDswoovUHn/rBMXsoaUHjNqZ2/4nIBlc5PWNcDhZywF4e/Wvz
wTeeVxSVnsyT6d8V2bTA
`;

const randomInt = () => Math.floor(Math.random() * (1024 + 1));
const IP = '127.0.0.1'
const BACKLOG = 100
const decodeCert = (b64Value: string) => {
  const wire = base64ToBytes(b64Value);
  const data = Decoder.decode(wire, Data);
  const cert = Certificate.fromData(data);
  return cert;
};

const decodeSafebag = async (b64Value: string, passcode: string) => {
  const wire = base64ToBytes(b64Value);
  const safebag = Decoder.decode(wire, SafeBag);
  const cert = safebag.certificate;
  const prvKey = await safebag.decryptKey(passcode);
  return { cert, prvKey };
};
const DEBUG = false;

let PORT = 3000
let WS = "wss://icear.cs.ucla.edu/ws/"
let APPPREFX: string
let NAME: string
const main = async () => {
  if (DEBUG) FwTracer.enable();

  const trustAnchor = decodeCert(TRUST_ANCHOR);
  const { cert, prvKey } = await decodeSafebag(SAFEBAG, '123456');
  const endpoint = new Endpoint();
//   const storage = await DenoKvStorage.create();
  const storage = new InMemoryStorage()
  const certStore = new CertStorage(trustAnchor, cert, storage, endpoint, prvKey);
  const appPrefix = new Name(APPPREFX)
  const nodeId = new Name(APPPREFX).append(NAME)

  const wsConn = new WsConnectMgr(nodeId, endpoint, appPrefix, certStore.signer, cert, WS)
  const face = await wsConn.wsConnect()
  if (face === undefined) {
     throw new Error('Face is nil')
  }

  const verifierBypass = { verify: () => Promise.resolve(), } 

  // TODO: Run without a signer
  const ydoc = new Y.Doc()
  const workspace = await Workspace.create({
    nodeId: nodeId,
    persistStore: storage,
    endpoint,
    rootDoc: ydoc,
    signer: certStore.signer,
    verifier: verifierBypass,
  });

  const server = new TcpServer(ydoc)
  server.listen(IP, PORT, BACKLOG)
  const exitSignal = new Promise<void>((resolve) => {
    Deno.addSignalListener('SIGINT', () => {
      console.log('Stopped by Ctrl+C');
      resolve();
    });
  });
  await exitSignal;

  workspace.destroy();
  face.close();
  // storage.close();  // Already did it in workspace. Need to be fixed.
  Deno.exit();
};

if (import.meta.main) {
  const parser = yargs(Deno.args).options({
    port: { type: "number", default: 3000 },
    ws: { type: "string", default: "wss://icear.cs.ucla.edu/ws/" },
    app: { type: "string"},
    name: { type: "string", default: "node"},
  });
  const argv = await parser.argv;
  PORT = argv.port;
  WS = argv.ws
  APPPREFX = argv.app
  NAME = argv.name + randomInt()
  await main();
}