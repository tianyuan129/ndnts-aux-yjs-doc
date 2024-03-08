import * as net from 'net'
import yargs from "yargs/yargs";

const IP = '127.0.0.1'
const create = {
    type: "create",
    content: {
        id: "123",
        uuid: "0"
    }
}
let update = {
    type: "update",
    content: {
        id: "123",
        uuid: "0",
        pos: {
            x: 1,
            y: 2,
            z: 3
        }
    }
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
    start(socket)
    // delay for a while to catch up
    socket.on('data', buffer => {
        const rets = buffer.toString().split('\n')
        rets.forEach(ret => {
            const retObj = JSON.parse(ret)
            console.log("I <-- ", retObj)
            if (retObj.type == "create_response") {
                update.content.id = retObj.content.id
                update.content.uuid = retObj.content.uuid
                update.content.pos = {
                    x: Math.random(),
                    y: Math.random(),
                    z: Math.random(),
                }
                setTimeout(() => {
                    console.log("O --> ", update)
                    socket.write(JSON.stringify(update))
                }, DELAY)
            }
        })
    })
});
