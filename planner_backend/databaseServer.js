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
// users must specify group with greatest importance (Idea for later, create ordering of groups importances. Much more technical)
const userInfo = `
  userId SERIAL PRIMARY KEY,
  primaryGroup INTEGER,
  cliques INTEGER[],
  subCliques INTEGER[],
  free INTEGER[],
  neighborsAndCounts JSONB,
  numberDistinctConnections INTEGER,
  invitations INTEGER[],
  calendars INTEGER DEFAULT 0
`
createTable('user_schema', 'users', userInfo)

// Added globalEventIds column. Must add eventIds attribute to group API
// 2-way relationship between events table and groups table.

const groupInfo = `
  groupId SERIAL PRIMARY KEY,
  description VARCHAR(55),
  memberIds INTEGER[],
  globalEventIds INTEGER[],
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
  timezone VARCHAR(4),
`
createTable('user_schema_meta', 'calendars', calendarInfo)

// added day and startInterval. Will edit to remove timeStamp. Need this way for algorithm since it is split into days and subdays
// added unset, set status to capture events that user inputs, and which must be fixed by update algorithm
// added event importance for update algo
const calendarMetaInfo = `
  userId INTEGER,
  calendarId INTEGER,
  eventId INTEGER,
  setStatus BOOLEAN,
  day VARCHAR(26),
  startInterval INTEGER,
  timeStamp VARCHAR(26) // GET RID OF AND REPLACE USES WITH DAY AND START INTERVAL
  importance INTEGER,
  edges VARCHAR(26)[],
  intervalsLasting INTEGER
`
createTable('user_schema_meta', 'calendars_meta', calendarMetaInfo)

// changed eventId from SERIAL -> INTEGER
// added globalEventId column, groupIds column and 2-way relationship between group and events table
// added deadline column
const eventInfo = `
  userId INTEGER,
  calendarId INTEGER,
  globalEventId INTEGER,
  eventId INTEGER,
  groupIds INTEGER[],
  tiedEvents INTEGER[],
  isFixed BOOLEAN,
  isRecurring BOOLEAN,
  importance INTEGER DEFAULT 5,
  deadline VARCHAR(26),
  description VARCHAR(55),
  PRIMARY KEY (userId, calendarId, eventId)
`
createTable('user_schema_meta', 'events', eventInfo)

const recurringEventsInfo = `
  userId INTEGER,
  calendarId INTEGER,
  eventId INTEGER,
  repetition INTEGER,
  timeout VARCHAR(26),
  exceptions INTEGER[] DEFAULT []
`
createTable('user_schema_meta', 'recurringEvents', recurringEventsInfo)

const updateLedgerInfo = `
  userId INTEGER,
  calendarId INTEGER,
  localEventId SERIAL,
  groupIds INTEGER[],
  tiedEvents INTEGER[],
  isFixed BOOLEAN,
  isRecurring BOOLEAN,
  repetition INTEGER,
  timeout VARCHAR(26),
  exceptions INTEGER[] DEFAULT []
  importance INTEGER DEFAULT 5,
  deadline VARCHAR(26),
  description VARCHAR(55),
  timeStamp VARCHAR(26),
  edges VARCHAR(26)[],
  intervalsLasting INTEGER
`

createTable('user_schema_meta', 'updateLedger', updateLedgerInfo)