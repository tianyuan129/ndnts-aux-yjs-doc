import * as net from 'net'
import { randomUUID } from 'crypto'
import { schemaValidate } from './message-schema.ts'
import * as Y from 'yjs'

export class TcpServer {
    protected _server: net.Server
    protected _sockets: net.Socket[]
    protected _objectMap: Y.Map<any>
    protected _history: object[]

    constructor(public readonly ydoc: Y.Doc) { 
      this._server = net.createServer()
      this._sockets = []
      this._objectMap = this.ydoc.getMap('objectMap')
      this._objectMap.observeDeep(this.deepListener.bind(this))
      this._history = []
    }
    private getResponseJson(result: number) {
      return { kind: "Response", result: result}
    }
    private getCreateObjectJson(parent: string, assetId: string, objectId: string) {
      return { kind: "CreateObject", 
               parent: parent, assetId: assetId, objectId: objectId
      }
    }
    propagateToSockets(source: net.Socket | undefined, json: object) {
      this._history.push(json)
      this._sockets.forEach(sock => {
        if (sock != source) {
          console.log(`writing back to ${sock.remoteAddress}:${sock.remotePort}`)
          sock.write(JSON.stringify(json) + '\n')
        }
      })
    }
    deepListener(events: Y.YEvent<any>[], trans: Y.Transaction) {
      if (trans.origin instanceof(net.Socket)) {
        console.log('deep object listener triggered from local ops') 
      }
      else {
        console.log('deep object listener triggered from network') 
      }
      events.forEach(eve => {
        eve.changes.keys.forEach((change, key) => {
          let submap = this._objectMap
          // jump to the correct submap
          eve.path.forEach(seg => { submap = submap.get(seg) })
          const scope = submap.get(key)
          const curr = scope instanceof(Y.Map)? scope.toJSON() : scope
          const prev = change.oldValue
          // if top level change happens, directly transmit the whole object as creation
          if (eve.path.length == 0) {
            const newObject = submap.get(key).toJSON()
            if (change.action == "add") {
              console.log(`Object "${key}" was added:`, curr)
            }
            else if (change.action == "update") {
              console.log(`Object "${key}" was updated.`, "New value", curr, "Previous value:", prev)
            }
            const toProp = { kind: "CreateObject", 
              parent: newObject.parent, assetId: newObject.assetId, objectId: newObject.objectId
            }
            this.propagateToSockets(trans.origin, toProp)
            // write back to socket
            // socket.write(JSON.stringify(
            //   this.getCreateObjectJson(newObject.get("parent"), newObject.get("assetId"), newObject.get("objectId"))
            // ))
          }
          else {
            const lastSeg = eve.path[eve.path.length - 1]
            if (lastSeg == "variableMap") {
              // okay, we know variable updated
              if (change.action == "add") {
                console.log(`Variable "${key}" was added:`, curr)
              }
              else if (change.action == "update") {
                console.log(`Variable "${key}" was updated.`, "New value", curr, "Previous value:", prev)
              }
              // get the objectID then
              const oid = submap.parent.get("objectId")
              const toProp = { kind: "NetworkVariableAssignment",
                objectId: oid, variableName: key, value: curr
              }
              this.propagateToSockets(trans.origin, toProp)
            }
          }
        })
      })
    }
    // on data coming in
    onData(socket: net.Socket, buffer: any) {
      const parsedJson = JSON.parse(buffer.toString())
      if (schemaValidate(parsedJson)) {
        // console.log("received json")
        // console.log(parsedJson)
        switch(parsedJson.kind) { 
          case "CreateObjectRequest": {
            // const newObject = {objectId: randomUUID(),
            //   parent: parsedJson.parent, assetId: parsedJson.assetId,
            //   variableStore: {}
            // }
            // write back in object map
            const newObject = new Y.Map()
            // register object listener, only this level
            // newObject.observe(objectListener.bind(newObject))
            this.ydoc.transact(() => {
              const oid = randomUUID()
              const variableMap = new Y.Map()
              newObject.set("objectId", oid)
              newObject.set("parent", parsedJson.parent)
              newObject.set("assetId", parsedJson.assetId)
              newObject.set("variableMap", variableMap)
              this._objectMap.set(oid, newObject)
            }, socket)
            // store.objStore[newObject.objectId] = newObject
            // write back in socket
            socket.write(JSON.stringify(
              this.getCreateObjectJson(newObject.get("parent"), newObject.get("assetId"), newObject.get("objectId"))
            ) + '\n')
            // then we should register 
            break; 
          }
          case "CreateObject": {
            console.log("Oops, something off")
            break; 
          }
          case "History": {
            this._history.forEach(json => {
              socket.write(JSON.stringify(json) + '\n')
              console.log(`wrote history for ${json.kind}`)
            })
            socket.write(JSON.stringify({ kind: "HistoryFinish" }) + '\n')
            break; 
          }
          case "NetworkVariableAssignment": {
            // the object of variable must be assigned first
            if (this._objectMap.has(parsedJson.objectId)) {
              // add an assignemtn section for it
              const selected = this._objectMap.get(parsedJson.objectId)
              const selectedVariables = selected.get("variableMap")
              // if first time, register listener
              this.ydoc.transact(() => {
                selectedVariables.set(parsedJson.variableName, parsedJson.value)
                // write back
                // objectMap.set(parsedJson.objectId, selected)
                // selected.variableStore[parsedJson.variableName] = parsedJson.value
                // write back in socket
              }, socket)
              socket.write(JSON.stringify(
                this.getResponseJson(200)
              ) + '\n')
            }
            else {
              // write back in socket
              socket.write(JSON.stringify(
                this.getResponseJson(403)
              ) + '\n')
            }
            break; 
          }
          case "TransformUpdate": {
            break; 
          }
          case "Response": {
            break; 
          }
          default: { 
             // it shouldn't happen, if does, schema validator has problems
             break; 
          } 
       } 
      }
      else {
        console.log("json in wrong format or handlers not registered")
      }
    // socket.end()
    }
    // blocking function
    listen(ip: string, port: number, backlog: number | undefined) {
      this._server.listen(port, ip, backlog)
      this._server.on('connection', socket => {
        // add socket into list
        this._sockets.push(socket)
        socket.on('data', buffer => this.onData(socket, buffer))
        socket.on('error', _ => {
          const idx = this._sockets.indexOf(socket)
          this._sockets.splice(idx, 1)
        });
        socket.on('close', () => {
          const idx = this._sockets.indexOf(socket)
          this._sockets.splice(idx, 1)
        });
        socket.on('disconnect', _ => {
          const idx = this._sockets.indexOf(socket)
          this._sockets.splice(idx, 1)
        });
      })
    }
}
// const server = new TcpServer()
// objectMap.observeDeep(server.deepListener.bind(server))
// server.listen(IP, PORT, BACKLOG)
