import { handleRequest } from './app'
import { getServerConfig } from './config'
import { createDatabaseContext } from './db'
import { ThinServerRepository } from './repositories'

const config = getServerConfig()
const database = createDatabaseContext(config.databasePath)
const repository = new ThinServerRepository(database)
repository.migrate()

const server = Bun.serve({
  hostname: config.host,
  port: config.port,
  fetch(request: Request) {
    return handleRequest(request, { database, repository, config })
  },
})

console.log(`OpenCodeUI thin server listening on http://${server.hostname}:${server.port}`)
