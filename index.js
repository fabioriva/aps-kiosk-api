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

const push = async (res, req, plc) => {
  log(req)
  res.onAborted(() => {
    res.aborted = true
  })
  const buffer = Buffer.allocUnsafe(2)
  buffer.writeUInt16BE(1, 0)
  const done = await plc.write(0x84, DBNR, 14, 2, 0x02, buffer)
  sendJson(res, { message: done ? 'closing' : 'error' })
}

const release = async (res, req, plc) => {
  log(req)
  res.onAborted(() => {
    res.aborted = true
  })
  const buffer = Buffer.allocUnsafe(2)
  buffer.writeUInt16BE(1, 0)
  const done = await plc.write(0x84, DBNR, 14, 2, 0x02, buffer)
  sendJson(res, { message: done ? 'opening' : 'error' })
}

const app = async () => {
  try {
    const app = uWS.App().listen(Number(process.env.PORT), token => logger.info(token))
    app
      .get(process.env.PATHNAME + '/push', async (res, req) => push(res, req, plc))
      .get(process.env.PATHNAME + '/release', async (res, req) => release(res, req, plc))
      .post(process.env.PATHNAME + '/pin', async (res, req) => pin(res, req, plc))
      .ws(process.env.PATHNAME, { open: ws => ws.subscribe(process.env.PATHNAME) })
      .any('/*', (res, req) => {
        log(req)
        res.end('Resource not found')
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