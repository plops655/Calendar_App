import dotenv from 'dotenv'
import pkg from 'pg'
import * as path from 'path'
const { Client, Pool } = pkg
import  { fileURLToPath } from 'url'

// .env config
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
    override: true,
    path: path.join(__dirname, 'development.env')
})

// app config 

const app = express()
const port = 9002

// middleware

app.use(express.json())
app.use(cors())

// db config

const userDBConfig = {
  user: process.env.USER,
  host: process.env.HOST,
  database: process.env.DATABASE,
  password: process.env.PASSWORD,
  port: process.env.PORT
}

const pool = new Pool(userDBConfig)

const createExtension = async(extension) => {
  const client = await pool.connect()
  try {
    await client.query(`CREATE EXTENSION IF NOT EXISTS ${extension}`)
  } catch(err) {
    console.log(err)
  } finally {
    client.release()
  }
}

const createSchema = async(schema) => {
  const client = await pool.connect()
  try {
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`)
    console.log('Schema created')
  } catch(err) {
    console.log(err)
  } finally {
    client.release()
  }
}

const createTable = async(schema, table, info) => {
  const client = await pool.connect()
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS ${schema}.${table} (
      ${info}
    );`)
    console.log('Table created')
  } catch(err) {
    console.log(err)
  } finally {
    client.release()
  }
}

// extensions to use

// create state schema
createSchema('user_schema')
createSchema('user_meta_schema')
// create user table. 
// changed user table to include invitations
// changed user table neighborsAndCounts JSONB[] -> JSONB
// added calendars column 
const userInfo = `
  userId SERIAL PRIMARY KEY,
  cliques INTEGER[],
  subCliques INTEGER[],
  free INTEGER[],
  neighborsAndCounts JSONB,
  numberDistinctConnections INTEGER,
  invitations INTEGER[],
  calendars INTEGER DEFAULT 0
`
createTable('user_schema', 'users', userInfo)

const groupInfo = `
  groupId SERIAL PRIMARY KEY,
  description VARCHAR(55),
  memberIds INTEGER[],
  type VARCHAR(55)
`
createTable('user_schema', 'groups', groupInfo)
// changed invitedStatus INTEGER[][] to JSONB
const cliqueInfo = `
  groupId INTEGER PRIMARY KEY
  bossId INTEGER,
  headEmployeeIds INTEGER[],
  invitedStatus JSONB[]
`
createTable('user_schema', 'cliques', cliqueInfo)
// changed invitedStatus INTEGER[][] to JSONB[]
const subCliqueInfo = `
groupId INTEGER PRIMARY KEY,
headEmployeeId INTEGER,
invitedStatus JSONB[]
`
createTable('user_schema', 'subCliques', subCliqueInfo)

// changed invitedStatus INTEGER[][] to JSONB[]
const freeInfo = `
  groupId INTEGER PRIMARY KEY,
  invitedStatus JSONB[]
`
createTable('user_schema', 'free', freeInfo)

// user_meta_schema

// changed calendars table

const calendarInfo = `
  userId INTEGER,
  calendarId INTEGER,
  numEvents INTEGER,
  minId INTEGER
`

createTable('user_schema_meta', 'calendars', calendarInfo)

// changed eventId from SERIAL -> INTEGER
const eventInfo = `
  userId INTEGER,
  calendarId INTEGER,
  eventId INTEGER,
  isFixed BOOLEAN,
  isRecurring BOOLEAN,
  PRIMARY KEY (userId, calendarId, eventId)
`
createTable('user_meta_schema', 'events', eventInfo)

const eventsMeta = `
  userId INTEGER,
  calendarId INTEGER,
  eventId INTEGER,
  start INTEGER,
  finish INTEGER,
  repetition INTEGER,
  exceptons INTEGER[] 
`
createTable('user_meta_schema', 'events_meta', eventsMeta)

