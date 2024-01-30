/* eslint-env browser */
import http from 'http'
import { WebSocketServer } from 'ws'
import { Session } from '@holepunchto/pear-inspect'
import b4a from 'b4a'

customElements.define('developer-tooling', class extends HTMLElement {
  router = null

  constructor () {
    super()
    this.template = document.createElement('template')
    this.template.innerHTML = `
      <div>
        <style>
          #add-key-input {
            width: 100%;
          }

          #add-key-error {
            color: red;
          }

          #no-apps.hidden {
            display: none;
          }

          .app {
            display: flex;
            align-items: center;
          }
          .app .title {
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .app:hover .remove {
            display: block;
          }
          .app .remove {
            cursor: pointer;
            padding-right: 10px;
            margin-left: calc(-1rem - 10px);
            width: 1rem;
            display: none;
          }
          #remote-inspect-explain {
            float:left;
            max-width:55%;
          }
          #remote-inspect {
            float:right;
            max-width:40%;
          }

          h2 { margin: 0 }
          p { 
            margin-block-start: 0.75em;
            margin-block-end: 0.75em;
          }

          input {
            all: unset;
            border: 1px ridge #B0D944;
            background: #000;
            color: #B0D944;
            padding: .45rem;
            font-family: monospace;
            font-size: 1rem;
            line-height: 1rem;
          }
          code {
            background: #3a4816;
            color: #efeaea;
            padding: 0.25rem;
            padding-top: 0.1rem;
            padding-bottom: 0.15rem;
            font-family: 'overpass-mono';
            border-radius: 1px;
            font-size: .9em;
          }
          pre > code { display: block; line-height: 1.025rem; padding-left: 1em; background: #181e19 }
        </style>

        <div>
          <h1>Developer Tooling</h1>
          <div id=remote-inspect-explain>
            <h2>Remotely inspect Pear applications.</h2>
          
            <p> Some application setup is required to enable remote debugging </p>
            <p> First install the <code>pear-inspect</code> module into the application </p>
            <pre><code>npm install pear-inspect</code></pre>
            <p> Then add the following JavaScript code to the application, at the top: </p>

            <pre><code>if (Pear.config.dev) {
  const { Inspector } = await import('pear-inspect')
  const inpector = await new Inspector()
  const key = await inpector.enable()
  console.log('Pear Inspector key:', key.toString('hex'))
}</code></pre>

            <p>When the application is opened in development mode the inspection key will be logged.</p>
            <p>Paste the logged key into the input and use a compatible inspect protocol tool, such as chrome://inspect to view the remote target</p>
            </div>
          <div id=remote-inspect>
            <div>
              <form id="add-key-form">
                <input id="add-key-input" type="text" placeholder="Paste Pear Inspector Key Here"/>
                <p id="add-key-error"></p>
              </form>
            </div>
            <h2>Apps</h2>
            <h3 id="no-apps">No apps added. Add an inspect key to start debugging.</h3>
            <div id="apps"></div>
          </div>
      </div>
    `
    this.root = this.attachShadow({ mode: 'open' })
    this.root.appendChild(this.template.content.cloneNode(true))

    this.addKeyFormElem = this.root.querySelector('#add-key-form')
    this.addKeyInputElem = this.root.querySelector('#add-key-input')
    this.addKeyErrorElem = this.root.querySelector('#add-key-error')
    this.appsElem = this.root.querySelector('#apps')
    this.noAppsElem = this.root.querySelector('#no-apps')
    this.apps = new Map()

    this.addKeyInputElem.addEventListener('keypress', e => {
      this.addKeyErrorElem.textContent = ''
    })

    this.addKeyFormElem.addEventListener('submit', e => {
      e.preventDefault()
      const inspectorKey = this.addKeyInputElem.value
      if (inspectorKey.length !== 64) {
        this.addKeyErrorElem.textContent = 'Key needs to be 64 characters long'
        return
      }

      const sessionId = generateUuid()
      const inspectorSession = new Session({ inspectorKey: b4a.from(inspectorKey, 'hex') })
      const app = {
        inspectorKey,
        title: '',
        url: '',
        inspectorSession
      }

      inspectorSession.on('close', () => {
        this.apps.delete(sessionId)
        this.renderApps()
      })
      inspectorSession.on('info', ({ filename }) => {
        app.url = filename
        app.title = filename.split('/').pop()
        this.apps.set(sessionId, app)
        this.renderApps()
      })

      this.addKeyInputElem.value = ''
      this.addKeyErrorElem.textContent = ''
      this.renderApps()
    })

    const devtoolsHttpServer = http.createServer()
    const devToolsWsServer = new WebSocketServer({ noServer: true })

    devtoolsHttpServer.listen(9229, () => console.log('[devtoolsHttpServer] running on port 9229'))
    devtoolsHttpServer.on('request', (req, res) => {
      if (req.url !== '/json/list') {
        res.writeHead(404)
        res.end()
        return
      }

      const targets = [...this.apps].map(([sessionId, app]) => ({
        description: 'node.js instance', // `Pear app: ${app.name}`,
        devtoolsFrontendUrl: `devtools://devtools/bundled/js_app.html?experiments=true&v8only=true&ws=127.0.0.1:9229/${sessionId}`,
        devtoolsFrontendUrlCompat: `devtools://devtools/bundled/inspector.html?experiments=true&v8only=true&ws=127.0.0.1:9229/${sessionId}`,
        faviconUrl: 'https://nodejs.org/static/images/favicons/favicon.ico',
        id: sessionId,
        title: app.title,
        type: 'node',
        url: `file://${app.url}`,
        webSocketDebuggerUrl: `ws://127.0.0.1:9229/${sessionId}`
      }))

      res.writeHead(200, {
        'Content-Type': 'application/json; charset=UTF-8',
        'Cache-Control': 'no-cache',
        'Content-Length': JSON.stringify(targets).length
      })
      res.end(JSON.stringify(targets))
    })
    devtoolsHttpServer.on('upgrade', (request, socket, head) => {
      console.log(`[devtoolsHttpServer] UPGRADE. url=${request.url}`)
      const sessionId = request.url.substr(1)
      const sessionIdExists = this.apps.has(sessionId)
      if (!sessionIdExists) return socket.destroy()

      devToolsWsServer.handleUpgrade(request, socket, head, ws => devToolsWsServer.emit('connection', ws, request))
    })

    devToolsWsServer.on('connection', (devtoolsSocket, request) => {
      const sessionId = request.url.substr(1)
      const app = this.apps.get(sessionId)
      if (!app) return devtoolsSocket.destroy()

      const { inspectorSession } = app

      const onMessage = msg => {
        const { pearInspectMethod } = msg
        const isACDPMessage = !pearInspectMethod

        if (isACDPMessage) return devtoolsSocket.send(JSON.stringify(msg))
      }
      inspectorSession.connect()
      inspectorSession.on('message', onMessage)
      devtoolsSocket.on('message', msg => inspectorSession.post(JSON.parse(msg)))
      devtoolsSocket.on('close', () => {
        inspectorSession.disconnect()
        inspectorSession.off('message', onMessage)
        app.connected = false
        this.renderApps()
      })

      app.connected = true
      this.renderApps()
    })
  }

  renderApps () {
    this.appsElem.replaceChildren(...[...this.apps].map(([sessionId, app]) => {
      const div = document.createElement('div')
      div.innerHTML = `
        <div class="app">
          <div class="remove" data-session-id="${sessionId}">✕</div>
          <div class="title">${app.title} (${app.url})</div>
        </div>
      `
      div.querySelector('.remove').addEventListener('click', () => {
        this.apps.delete(sessionId)
        this.renderApps()
      })

      return div
    }))

    if (this.apps.size > 0) {
      this.noAppsElem.classList.add('hidden')
    } else {
      this.noAppsElem.classList.remove('hidden')
    }

  }

  load () {
    this.style.display = ''
  }

  unload () {
    this.style.display = 'none'
  }
})

// Can't use `uuid` module for some reason as it results in a throw with `crypto` when importing
function generateUuid () {
  let result, i, j
  result = ''
  for (j = 0; j < 32; j++) {
    if (j === 8 || j === 12 || j === 16 || j === 20) {
      result = result + '-'
    }
    i = Math.floor(Math.random() * 16).toString(16)
    result = result + i
  }
  return result
}