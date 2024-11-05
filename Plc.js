const EventEmitter = require('events')
const logger = require('pino')()
const snap7 = require('node-snap7')
const util = require('util')

const IP = process.env.IP
const RACK = Number(process.env.RACK)
const SLOT = Number(process.env.SLOT)
const DBNR = Number(process.env.DB_NR)
const INIT = Number(process.env.DB_START)
const AMOUNT = Number(process.env.DB_AMOUNT)

class PLC extends EventEmitter {
  constructor () {
    super()
    this.client = new snap7.S7Client()
    this.online = false
  }

  data (buffer) {
    // console.log(buffer)
    return {
      comm: this.online,
      lang: buffer.readInt16BE(0),
      page: buffer.readInt16BE(2),
      card: buffer.readInt16BE(4),
      digitNr: buffer.readInt16BE(6),
      errMesg: buffer.readInt16BE(8),
      successMesg: buffer.readInt16BE(10)
    }
  }

  error (e) {
    this.online = !this.client.Disconnect()
    isNaN(e) ? logger.error(e) : logger.error(this.client.ErrorText(e))
  }

  run () {
    this.online = this.client.ConnectTo(IP, RACK, SLOT)
    setInterval(async () => {
      try {
        if (this.online) {
          await this.write(0x84, 37, 14 * 8 + 0, 1, 0x01, Buffer.from([1])) // watchdog (DB37.DBX14.0)
          const buffer = await this.read(0x84, DBNR, INIT, AMOUNT, 0x02)
          this.emit('pub', {
            channel: process.env.PATHNAME,
            data: JSON.stringify(this.data(buffer))
          })
        } else {
          this.online = this.client.Connect()
          this.online ? logger.info('Connected to PLC %s', IP) : logger.info('Connecting to PLC %s ...', IP)
          this.emit('pub', {
            channel: process.env.PATHNAME,
            data: JSON.stringify(this.data(Buffer.alloc(AMOUNT)))
          })
        }
      } catch (e) {
        this.error(e)
      }
    }, process.env.POLL)
  }

  async read (area, dbNumber, start, amount, wordLen) {
    return await readArea(this.client, area, dbNumber, start, amount, wordLen)
  }

  async write (area, dbNumber, start, amount, wordLen, buffer) {
    return await writeArea(this.client, area, dbNumber, start, amount, wordLen, buffer)
  }
}

const readArea = util.promisify(
  (client, area, dbNumber, start, amount, wordLen, callback) => {
    client.ReadArea(area, dbNumber, start, amount, wordLen, function (
      err,
      data
    ) {
      if (err) return callback(err)
      callback(err, data)
    })
  }
)

const writeArea = util.promisify(
  (client, area, dbNumber, start, amount, wordLen, buffer, callback) => {
    client.WriteArea(area, dbNumber, start, amount, wordLen, buffer, function (
      err
    ) {
      if (err) return callback(err)
      callback(err, true)
    })
  }
)

module.exports = PLC
