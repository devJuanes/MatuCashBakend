const env = require('../config/env')

const queue = []
let running = false

function randomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function runNext() {
  if (running) return
  running = true
  while (queue.length) {
    const task = queue.shift()
    try {
      await task()
    } finally {
      await sleep(randomDelay(env.minSendDelayMs, env.maxSendDelayMs))
    }
  }
  running = false
}

function enqueue(task) {
  return new Promise((resolve, reject) => {
    queue.push(async () => {
      try {
        const result = await task()
        resolve(result)
      } catch (err) {
        reject(err)
      }
    })
    runNext()
  })
}

module.exports = { enqueue }
