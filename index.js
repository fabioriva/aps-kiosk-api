require('dotenv').config()
const uWS = require('uWebSockets.js')
const logger = require('pino')()
const { readJson, sendJson } = require('./json')
const Plc = require('./Plc')

const DBNR = Number(process.env.DB_NR)

const log = (req) => {
  logger.info({
    'user-agent': req.getHeader('user-agent'),
    method: req.getMethod(),
    url: req.getUrl()
  })
}

const close = async (res, req, plc) => {
  log(req)
  res.onAborted(() => {
    res.aborted = true
  })
  const status = req.getParameter(0)
  const buffer = Buffer.allocUnsafe(2)
  buffer.writeUInt16BE(parseInt(status), 0)
  const done = await plc.write(0x84, DBNR, 14, 2, 0x02, buffer)
  sendJson(res, { message: done ? status : 'error' })
}

const pin = async (res, req, plc) => {
  log(req)
  readJson(
    res,
    async json => {
      const { pin } = json
      // const regexp = /^[a-fA-F0-9]{3}$/
      // console.log(json, regexp.test(json.pin))
      const buffer = Buffer.alloc(2)
      buffer.writeInt16BE(parseInt(pin, 16), 0) // string to hex
      const done = await plc.write(0x84, DBNR, 16, 2, 0x02, buffer)
      sendJson(res, { pin, written: done })
    })
}

const tag = async (res, req, plc) => {
  log(req)
  readJson(
    res,
    async json => {
      const { uid, data } = json
      let done
      // UID
      console.log('uid:', typeof uid, uid.length, uid)
      const uidBuffer = Buffer.from(uid, 'hex')
      console.log(uidBuffer, uidBuffer.length)
      done = await plc.write(0x84, DBNR, 18, uidBuffer.length, 0x02, uidBuffer)
      console.log('write uid', done)
      // data
      console.log('data:', typeof data, data.length, data)
      if (data[0] === 'F' && data[data.length - 1] === 'E') {
        console.log(data[0], data[data.length - 1])
        const park = Number(data.slice(1, 3))
        const tag = Number(data.slice(3, 7))
        console.log(park, tag)
        const dataBuffer = Buffer.alloc(4)
        dataBuffer.writeInt16BE(park, 0)
        dataBuffer.writeInt16BE(tag, 2)
        console.log(dataBuffer, dataBuffer.length)
        done = await plc.write(0x84, DBNR, 26, dataBuffer.length, 0x02, dataBuffer)
        console.log('write data', done)
      } else {
        console.log('Tag not formatted')
      }
      sendJson(res, { uid, data })
    })
}

const app = async () => {
  try {
    const app = uWS.App().listen(Number(process.env.PORT), token => logger.info(token))
    app
      .get(process.env.PATHNAME + '/close/:status', async (res, req) => close(res, req, plc))
      .post(process.env.PATHNAME + '/pin', async (res, req) => pin(res, req, plc))
      .post(process.env.PATHNAME + '/tag', async (res, req) => tag(res, req, plc))
      .ws(process.env.PATHNAME, { open: ws => ws.subscribe(process.env.PATHNAME) })
      .any('/*', (res, req) => {
        log(req)
        res.end('aps-kiosk-api - resource not found')
      })
    const plc = new Plc()
    plc.run()
    plc.on('pub', ({ channel, data }) => app.publish(channel, data))
  } catch (e) {
    logger.error(new Error(e))
    process.exit(1)
  }
}

app()
