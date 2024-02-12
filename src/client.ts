import * as net from 'net'
import yargs from "yargs/yargs";

const IP = '127.0.0.1'
const create = {
    kind: "CreateObjectRequest",
    parent: "xxxxx",
    assetId: "yyyyy"
}
let assign = {
    kind: "NetworkVariableAssignment",
    objectId: "xxxxx",
    variableName: "position",
    value: [0, 0, 0]
}
let history = {
    kind: "History"
}
const parser = yargs(Deno.args).options({
    port: { type: "number", default: 3000 },
    delay: { type: "number", default: 0 },
  });
const argv = await parser.argv;
const PORT = argv.port;
const DELAY = argv.delay;
const socket = new net.Socket();
// let counter = 3
function start(socket: net.Socket) {
    console.log("O --> ", create)
    socket.write(JSON.stringify(create))
}
socket.connect(PORT, IP);
socket.on('connect', function() { //Don't send until we're connected
    // delay for a while to catch up
    console.log("O --> ", history)
    socket.on('data', buffer => {
        const rets = buffer.toString().split('\n')
        rets.forEach(ret => {
            const retObj = JSON.parse(ret)
            console.log("I <-- ", retObj)
            if (retObj.kind == "HistoryFinish") {
                start(socket)
            }
            if (retObj.kind == "CreateObject") {
                assign.objectId = retObj.objectId
                assign.value = [Math.random(), Math.random(), Math.random()]
                setTimeout(() => {
                    console.log("O --> ", assign)
                    socket.write(JSON.stringify(assign))
                }, DELAY)
            }
        })
    })
    socket.write(JSON.stringify(history))
});
