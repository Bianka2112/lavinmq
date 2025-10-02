const evtSource = new window.EventSource('api/livelog')
const livelog = document.getElementById('livelog')
const tbody = document.getElementById('livelog-body')
const filterInput = document.getElementById('log-filter')
const btnToTop = document.getElementById('to-top')
const btnToBottom = document.getElementById('to-bottom')
const loading = document.getElementById('log-loading')

const allLogs = []
const pendingLogs = []

const MAX_ROWS = 2000
const INITIAL_ROWS = 1000
const ROWS_PER_FRAME = 150
const BOOT_MIN_LOGS = INITIAL_ROWS
const BOOT_MAX = 25000

let isFrameQueued = false
let shouldAutoScroll = true
let currentRegex = null
let booting = true
let bootTime = performance.now()
let paintCount = 0

// SSE
evtSource.onmessage = (event) => {
  const timestamp = new Date(parseInt(event.lastEventId))
  const [severity, source, message] = JSON.parse(event.data)
  const log = { timestamp, severity, source, message }
  pendingLogs.push(log)
  if (booting) {
    loading.hidden = false
    tbody.style.visibility = 'hidden'
  }
  requestPaint()
}

evtSource.onerror = () => {
  window.fetch('api/whoami')
    .then(response => response.json())
    .then(whoami => {
      if (!whoami.tags.includes('administrator')) {
        forbidden()
      }
    })
}

function forbidden () {
  const tblError = document.getElementById('table-error')
  tblError.textContent = 'Access denied, administator access required'
  tblError.style.display = 'block'
}

// Build Table
const buildRow = (log) => {
  const tdTs = document.createElement('td')
  tdTs.textContent = log.timestamp.toLocaleString()
  const tdSev = document.createElement('td')
  tdSev.textContent = log.severity
  const tdSrc = document.createElement('td')
  tdSrc.textContent = log.source
  const preMsg = document.createElement('pre')
  preMsg.textContent = log.message
  const tdMsg = document.createElement('td')
  tdMsg.appendChild(preMsg)
  
  const tr = document.createElement('tr')
  tr.append(tdTs, tdSev, tdSrc, tdMsg)
  return tr
}

// Request Animation Frame
const requestPaint = () => {
  if (isFrameQueued) return
  isFrameQueued = true
  requestAnimationFrame(() => {
    isFrameQueued = false
    paintIncoming()
  })
}

// DocumentFragment = save logs off-DOM, render to DOM as directed. Use rAF for smooth updates, batch rendering large logs
const paintIncoming = () => {
  console.debug('booting', booting, 'pending', pendingLogs.length, 'tbodyRows', tbody.rows.length)
  
  const hadRows = tbody.rows.length > 0
  const now = performance.now()

  if (booting) {
    const minLogs = pendingLogs.length >= BOOT_MIN_LOGS
    const minWait = (now - bootTime) >= BOOT_MAX

    if (!minLogs && !minWait) {
      requestPaint()
      return
    }

    const initPaint = Math.min(pendingLogs.length, INITIAL_ROWS, MAX_ROWS)
    
    if (initPaint === 0) {
      requestPaint() 
      return
    }

    // Build off-DOM
    const batch = pendingLogs.splice(0, initPaint)

    const frag = document.createDocumentFragment()
    for (const log of batch) {
      allLogs.push(log)
      if (allLogs.length > MAX_ROWS) allLogs.shift()
      if (matches(log)) frag.appendChild(buildRow(log))
    }

    if (!hadRows) tbody.textContent = ''
    if (frag.childNodes.length) tbody.appendChild(frag)
    
    while (tbody.rows.length > MAX_ROWS) tbody.deleteRow(0)

    tbody.style.visibility = 'visible'
    loading.hidden = true
    booting = false

    livelog.scrollTop = livelog.scrollHeight
      
    if (pendingLogs.length) 
      requestPaint()
      return
  } 
  // NORMAL PHASE: small batches regularly (append-only)
  const repaint = Math.min(ROWS_PER_FRAME, pendingLogs.length)
  if (repaint === 0) return

  const batch = pendingLogs.splice(0, repaint)

  const frag = document.createDocumentFragment()
  for (const log of batch) {
    allLogs.push(log)
    if (allLogs.length > MAX_ROWS) allLogs.shift()
    if (matches(log)) frag.appendChild(buildRow(log))
  }

  if (frag.childNodes.length) tbody.appendChild(frag)

  while (tbody.rows.length > MAX_ROWS) tbody.deleteRow(0)

  livelog.scrollTop = livelog.scrollHeight  

  if (pendingLogs.length) {
    requestPaint()
  }
}

// Helpers
const matches = (log) => {
  if (!currentRegex) return true
  const searchString = `${log.timestamp.toISOString()} ${log.severity} ${log.source}${log.message ?? ''}`
  return currentRegex.test(searchString)
}
// On filter change:
const rebuildFromAllLogs = () => {
  const frag = document.createDocumentFragment()
  for (const log of allLogs) {
    if (matches(log)) frag.appendChild(buildRow(log))
  }
    tbody.textContent = ''
    tbody.appendChild(frag)

    while (tbody.rows.length > MAX_ROWS) {
      tbody.deleteRow(0)
    }

  if (shouldAutoScroll) livelog.scrollTop = livelog.scrollHeight
}

// Live typing: compile & rebuild
filterInput.addEventListener('input', () => {
  const q = filterInput.value.trim()
  try {
    currentRegex = q ? new RegExp(q, 'i') : null
    filterInput.classList.toggle('invalid', false)
  } catch {
    currentRegex = null
    filterInput.classList.toggle('invalid', true)
  }
  rebuildFromAllLogs()
})

// Fires when the native clear “×” is clicked (because type="search")
filterInput.addEventListener('search', () => {
  if (filterInput.value === '') {
    currentRegex = null
    rebuildFromAllLogs()
  }
})

filterInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault()
    rebuildFromAllLogs()
  } else if (e.key === 'Escape' && filterInput.value) {
    currentRegex = null
    filterInput.value = ''
    rebuildFromAllLogs()
  }
})

// Scrolling
btnToTop?.addEventListener('click', () => {
  livelog.scrollTop = 0
  shouldAutoScroll = false
})

btnToBottom?.addEventListener('click', () => {
  livelog.scrollTop = livelog.scrollHeight
  shouldAutoScroll = true
})

let lastScrollTop = livelog.pageYOffset || livelog.scrollTop
livelog.addEventListener('scroll', event => {
  const { scrollHeight, scrollTop, clientHeight } = event.target
  const st = livelog.pageYOffset || livelog.scrollTop
  if (st > lastScrollTop && shouldAutoScroll === false) {
    shouldAutoScroll = (Math.abs(scrollHeight - clientHeight - scrollTop) < 3)
  } else if (st < lastScrollTop) {
    shouldAutoScroll = false
  }
  lastScrollTop = st <= 0 ? 0 : st
})

// // Add 1000 fake logs quickly to test batching:
// let n = 0
// const fake = setInterval(() => {
//   const log = {
//     timestamp: new Date(),
//     severity: ['INFO','WARN','ERROR'][Math.floor(Math.random()*3)],
//     source: 'dev',
//     message: 'test #' + (++n)
//   }
//   pendingLogs.push(log)
//   requestPaint()
//   if (n >= 1000) clearInterval(fake)
// }, 2)

window.addEventListener('beforeunload', () => evtSource.close())
