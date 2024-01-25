
# How to connect two Peers by key with Hyperdht

Get setup by creating a project folder and installing dependencies:

```bash
mkdir connect-two-peers
cd connect-two-peers
pear init -y -t terminal
npm install hyperdht b4a graceful-goodbye
```

[Hyperswarm](../building-blocks/hyperswarm.md) helps to find and connect to peers who are announcing a common 'topic'. The swarm topic can be anything. The HyperDHT uses a series of holepunching techniques to establish direct connections between peers, even if they're located on home networks with tricky NATs.

In the HyperDHT, peers are identified by a public key, not by an IP address. With the public key, users can connect to each other irrespective of their location, even if they move between different networks.

> Hyperswarm's holepunching will fail if both the client peer and the server peer are on randomizing [NATs](https://en.wikipedia.org/wiki/Network_address_translation), in which case the connection must be relayed through a third peer. Hyperswarm does not do any relaying by default.

> For example, Keet implements its relaying system wherein other call participants can serve as relays -- the more participants in the call, the stronger overall connectivity becomes.

Use the HyperDHT to create a basic CLI chat app where a client peer connects to a server peer by public key. This example consists of two files: `client.js` and `server.js`.

`server.js` will create a key pair and then start a server that will listen on the generated key pair. The public key is logged into the console. Copy it for instantiating the client.


```javascript
//server.js
import DHT from 'hyperdht'
import goodbye from 'graceful-goodbye'
import b4a from 'b4a'

const dht = new DHT()

// This keypair is your peer identifier in the DHT
const keyPair = DHT.keyPair()

const server = dht.createServer(conn => {
  console.log('got connection!')
  process.stdin.pipe(conn).pipe(process.stdout)
})

server.listen(keyPair).then(() => {
  console.log('listening on:', b4a.toString(keyPair.publicKey, 'hex'))
})

// Unnannounce the public key before exiting the process
// (This is not a requirement, but it helps avoid DHT pollution)
goodbye(() => server.close())
```

`client.js` will spin up a client, and the public key copied earlier must be supplied as a command line argument for connecting to the server. The client process will log `got connection` into the console when it connects to the server.

Once it's connected, try typing in both terminals!

``` javascript
//client.js
import DHT from 'hyperdht'
import b4a from 'b4a'

console.log('Connecting to:', process.argv[2])
const publicKey = b4a.from(process.argv[2], 'hex')

const dht = new DHT()
const conn = dht.connect(publicKey)
conn.once('open', () => console.log('got connection!'))

process.stdin.pipe(conn).pipe(process.stdout)
```
