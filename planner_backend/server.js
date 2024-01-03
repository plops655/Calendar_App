import dotenv from 'dotenv'
import pkg from 'pg'
import express from 'express'
import axios from './axios.js'
import cookieParser from 'cookie-parser'
import Pusher from'pusher'
import cors from 'cors'
import * as path from 'path'
const { Client, Pool } = pkg
import  { fileURLToPath } from 'url'
import authenticateCookie from "./authenticateCookie.js"
import timestamp from "unix-timestamp"
import { DateTime } from "luxon"

// .env config
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const utcOffset = 0
const pstOffset = -28800
const etOffset = -18000

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
app.use(cookieParser())

// db config

const userDBConfig = {
  user: process.env.USER,
  host: process.env.HOST,
  database: process.env.DATABASE,
  password: process.env.PASSWORD,
  port: process.env.PORT
}

const pool = new Pool(userDBConfig)

// user API

app.get("/v1/user/:userId/:type", async (req, res) => {
    const userId = req.params.userId
    const type = req.params.type
    const client = await pool.connect()
    try {
        const cliques = await client.query(`SELECT $1 FROM user_schema.users WHERE userId=$2`, [type, userId])
        res.status(200).send(cliques)
    } catch(err) {
        res.status(400).send(`There was an error ${err}`)
    } finally {
        client.release()
    }
})

// app.post("/v1/user/joinGroup") ~ app.post("/v1/group/add")

app.delete("/v1/user/:userId/:groupId", async(req, res) => {
    const client = await pool.connect()
    const userId = req.params.userId
    const groupId = req.params.groupId
    try {
        const groupQuery = await client.query(`SELECT * FROM user_schema.groups WHERE groupId=$1`, [groupId])
        const groupInfo = groupQuery.rows[0]
        const type = groupInfo.type
        if (type === "cliques") {
            const isBossQuery = await client.query(`SELECT EXISTS (
                SELECT 1 FROM user_schema.cliques WHERE groupId = $1 AND bossId = $2
            ) AS isBoss`, [groupId, userId])
            const isHeadEmployeeQuery = await client.query(`SELECT EXISTS (
                SELECT 1 FROM user_schema.cliques WHERE groupId = $1 AND  $2=ANY(headEmployeeIds)
            ) AS isHeadEmployee`, [groupId, userId])
            const isBoss = isBossQuery.rows[0].isboss
            const isHeadEmployee = isHeadEmployeeQuery.rows[0].isheademployee
            if (isBoss) {
                // FIGURE OUT WHAT TO DO
            } else if (isHeadEmployee) {
                // alert boss. must reassign head employee
            } else {
                // get rid of employee
                await client.query(`UPDATE user_schema.users SET cliques=ARRAY_REMOVE(cliques, $1) WHERE userId=$2`, [groupId, userId])
                await client.query(`DO $$ 
                                    DECLARE 
                                        user_id INTEGER;
                                    BEGIN
                                        FOR user_id IN 
                                            SELECT unnest(memberIds) FROM user_schema.groups WHERE groupId=$1;
                                        LOOP
                                            CONTINUE WHEN user_id=$2;
                                            IF (SELECT neighborsAndCounts->>user_id FROM user_schema.users WHERE userId=$2)::INTEGER > 1 THEN
                                                UPDATE user_schema.users 
                                                SET 
                                                neighborsAndCounts = jsonb_set(neighborsAndCounts, '{user_id}', (neighborsAndCounts->>user_id)::int - 1)::jsonb
                                                WHERE userId=$2;
                                            ELSE
                                                UPDATE user_schema.users 
                                                SET 
                                                neighborsAndCounts = jsonb_remove(neighborsAndCounts, '{user_id}')
                                                numberDistinctConnections = numberDistinctConnections - 1
                                                WHERE userId=$2;
                                            END IF;
                                            IF (SELECT neighborsAndCounts->>$2 FROM user_schema.users WHERE userId=user_id)::INTEGER > 1 THEN
                                                UPDATE user_schema.users 
                                                SET 
                                                neighborsAndCounts = jsonb_set(neighborsAndCounts, '{${userId}}', (neighborsAndCounts->>${userId})::int - 1)::jsonb
                                                WHERE userId=user_id;
                                            ELSE
                                                UPDATE user_schema.users 
                                                SET 
                                                neighborsAndCounts = jsonb_remove(neighborsAndCounts, '{$2}')
                                                numberDistinctConnections = numberDistinctConnections - 1
                                                WHERE userId=user_id;
                                            END IF;
                                        END LOOP;
                                    END $$`, [groupId, userId])
                res.status(200).send(`Successfully deleted user ${userId} from clique ${groupId}`)
            }
        }
    } catch(err) {
        res.status(400).send("An error occurred when deleting user", err)
        console.log(err)
    } finally {
        client.release()
    }
})

// group API

app.post("/v1/group/", async(req,res) => {
    const client = await pool.connect()
    const { userId, description, type } = req.body
    try {
        const insertQuery = await client.query(`INSERT INTO user_schema.groups (description, type) VALUES 
        ($1, $2) RETURNING groupId`, [description, type])
        const groupId = insertQuery.rows[0].groupid
        await client.query(`UPDATE user_schema.groups SET memberIds = array_append(memberIds, $1) WHERE groupId = $2`, [userId, groupId])
        await client.query(`UPDATE user_schema.users SET $1=array_append($1, $2) WHERE userId=$3`, [type, groupId, userId])
        res.status(200).send({
            groupId: groupId
       })
    } catch(err) {
       res.status(400).send(err)
       console.log(err)
    } finally {
       client.release()
    }
})

app.post("/v1/group/add", async(req, res) => {
    const client = await pool.connect()
    const { userId, groupId, type } = req.body
    try {
        await client.query(`UPDATE user_schema.users SET $1=array_append($1, $2)`, [type, groupId])
        await client.query(`DO $$ 
                            DECLARE 
                                user_id INTEGER;
                            BEGIN
                                FOR user_id IN 
                                    SELECT unnest(memberIds) FROM user_schema.groups WHERE groupId=$1;
                                LOOP
                                    UPDATE user_schema.users 
                                        SET neighborsAndCounts=jsonb_set(COALESCE(neighborsAndCounts, '{}'::jsonb), '{user_id}}', COALESCE((neighborsAndCounts->>user_id)::int+1,1)::jsonb, true)
                                    WHERE userId=$2; 
                                    UPDATE user_schema.users 
                                        SET neighborsAndCounts=jsonb_set(COALESCE(neighborsAndCounts, '{}'::jsonb), '{$2}', COALESCE((neighborsAndCounts->>$2)::int+1,1)::jsonb, true)
                                    WHERE userId=user_id;  
                                END LOOP;
                            END $$`, [groupId, userId])
        await client.query(`UPDATE user_schema.groups SET memberIds = array_append(memberIds, $1) WHERE groupId = $2`, [userId, groupId])
        res.status(200).send({
            groupId: groupId
       })
    } catch(err) {
       res.status(400).send(err)
       console.log(err)
    } finally {
       client.release()
    }
})

app.get("/v1/group/:groupId/", async(req, res) => {
    const client = await pool.connect()
    const groupId = req.params.groupId
    try {
        const groupQuery = await client.query(`SELECT * FROM user_schema.groups WHERE groupId=$1`, [groupId])
        const groupInfo = groupQuery.rows[0]
        if (groupInfo.type === "cliques") {
            // call clique method
            const response = axios.get("/v1/clique/:groupId")
            res.status(200).send(response.data)
        } else if (groupInfo.type === "subCliques") {
            // send subclique method
            const response = axios.get("/v1/subClique/:groupId")
            res.status(200).send(response.data)
        } else if (groupInfo.type === "free") {
            res.status(200).send({
                groupId: groupInfo.groupid,
                description: groupInfo.description,
                memberIds: groupInfo.memberids,
                type: groupInfo.type
            })
        } else {
            res.status(400).send(`Error with getting data from group with id ${groupId}`)
        }
    } catch(err) {
        res.status(400).send(`Error with getting data from group with id ${groupId}, ${err}`)
        console.log(err)
    } finally {
        client.release()
    }
})


// subClique API

app.get("/v1/subClique/:groupId", async(req, res) => {
    const groupId = req.params.groupId
    const client = await pool.connect()
    try {
        const subCliqueQuery = await client.query(`SELECT * FROM user_schema.subCliques WHERE groupId=$1`, [groupId])
        const subCliqueInfo = subCliqueQuery.rows[0]
        res.status(200).send({
            groupId: groupId,
            headEmployeeId: subCliqueInfo.heademployeeid,
            invitedStatus: subCliqueInfo.invitedstatus
        })
    } catch(err) {
        res.status(400).send(`There was an error ${err}`)
    } finally {
        client.release()
    }
})

// clique API

app.post("/v1/clique", async (req, res) => {
    const { userId, description } = req.body
    const client = await pool.connect()
    try {
        const response = await axios.post("/v1/group", {
            userId: userId,
            description: description,
            type: "cliques"
        })
        const groupId = response.data.groupId
        await client.query(`INSERT INTO user_schema.cliques (groupId, bossId) VALUES 
        ($1, $2)`, [groupId, userId])
        res.status(200).send(`Successfully created clique with groupId ${groupId} and bossId ${userId}`)
    } catch(err) {
        res.status(400).send(`There was an error ${err}`)
        console.log(err)
    } finally {
        client.release()
    }
})

app.get("/v1/clique/:groupId", async(req, res) => {
    const groupId = req.params.groupId
    const client = await pool.connect()
    try {
        const cliqueQuery = await client.query(`SELECT * FROM user_schema.cliques WHERE groupId=$1`, [groupId])
        const cliqueInfo = cliqueQuery.rows[0]
        res.status(200).send({
            groupId: groupId,
            bossId: cliqueInfo.bossid,
            headEmployeeIds: cliqueInfo.heademployeeids,
        })
    } catch(err) {
        res.status(400).send(`There was an error ${err}`)
    } finally {
        client.release()
    }
})

app.post("/v1/clique/invitation", async(req, res) => {
    const userId = req.user.userId
    const { inviteeId, groupId } = req.body
    const client = await pool.connect()
    try {
        const isBossQuery = await client.query(`SELECT EXISTS (
            SELECT 1 FROM user_schema.cliques WHERE groupId=$1 AND bossId=$2
        ) AS isBoss`, [cliqueId, userId])
        const isBoss = isBossQuery.rows[0].isboss
        if (!isBoss) {
            res.status(401).send("Not authorized to invite members.")
        }
        await client.query(`UPDATE user_schema.cliques SET invitedStatus=array_append(invitedStatus, '{$1: 1}'::jsonb) WHERE groupId=$2 AND bossId=$3`, [inviteeId, groupId, userId])
        res.status(200).send(`Sent invite to user ${inviteeId}`)
    } catch(err) {
        res.status(400).send(`There was an error ${err}`)
        console.log(err)
    } finally {
        client.release()
    }
})

app.get("/v1/clique/invitations/:groupId/:userId", async(req, res) => {
    const groupId = req.params.groupId
    const userId = req.params.userId
    const client = await pool.connect()
    try {
        const isBossQuery = await client.query(`SELECT EXISTS (
            SELECT 1 FROM user_schema.cliques WHERE groupId=$1 AND bossId=$2
        ) AS isBoss`, [groupId, userId])
        const isBoss = isBossQuery.rows[0].isboss
        if (!isBoss) {
            res.status(401).send("Not authorized to invite members.")
        }
        const selectInvitedQuery = await client.query(`SELECT invitedStatus FROM user_schema.cliques WHERE groupId=${groupId} AND bossId=${userId}`)
        const invitedTokens = selectInvitedQuery.rows[0].invitedstatus
        const invited = invitedTokens.map(status => {
            if (status.status === 0) {
                return {
                    userId: status.userId,
                    invitedStatus: "Denied invite"
                }
            } else if (status.status === 1) {
                return {
                    userId: status.userId,
                    invitedStatus: "Invite pending"
                }
            } else if (status.status === 2) {
                return {
                    userId: status.userId,
                    invitedStatus: "Declined invite"
                }
            } else if (status.status === 3) {
                return {
                    userId: status.userId,
                    invitedStatus: "Invited"
                }
            }
        })
        res.status(200).send(`Sent invite to user ${invited}`)
    } catch(err) {
        res.status(400).send(`There was an error ${err}`)
        console.log(err)
    } finally {
        client.release()
    }
})

app.post("/v1/clique/joinRequest/:groupId", async (req, res) => {
    const client = await pool.connect()
    const { userId } = req.body
    const groupId = req.params.groupId
    try {
        const existsQuery = await client.query(`SELECT EXISTS (
            SELECT 1 FROM user_schema.users WHERE userId=$1 AND $2 = ANY(cliques)
        ) AS idExists`, [userId, groupId])
        const idExists = existsQuery.rows[0].idExists
        if (idExists) {
            res.status(400).send("User already in clique")
        }
        await client.query(`SELECT bossId FROM user_schema.cliques WHERE groupId = $1`, (groupId))
        await client.query(`UPDATE user_schema.cliques SET invitedStatus = jsonb_set(userId, '{userId}', COALESCE(invitedStatus -> 'userId', '[]'::jsonb) || 
        '{$1: 1}',
        true)`, [userId])
        res.status(200).send("Join request sent")
    } catch(err) {
        res.status(400).send(`There was an error ${err}`)
    } finally {
        client.release()
    }
})

// calendar API - only call during initialization

function findIntervals(beginTime, timeStamp, timezone) {
    const secondsDifference = (new Date(timeStamp).getTime() - new Date(beginTime).getTime()) / 1000
    return Math.floor(secondsDifference / 900)
}

function mergeHelper(events, l, m, r) {
    const L = new Array(m - l + 1)
    const R = new Array(r - m)

    for (let i = l; i <= m; i += 1) {
        L[i - l] = events[i]
    }
    for (let j = m + 1; j <= R; j += 1) {
        R[j - m - 1] = events[j]
    }

    let i = 0
    let j = 0
    let k = l
    while (i < m - l + 1 && j < r - m) {
        if (L[i].start <= R[j].start) {
            events[k] = L[i]
            i += 1
        } else {
            events[k] = R[j]
            j += 1
        }
        k += 1
    }

    while (i < m - l + 1) {
        events[k] = L[i]
        i += 1
        k += 1
    }

    while (j < r - m) {
        events[k] = R[j]
        j += 1
        k += 1
    }
}

function mergeSortByStart(events, l, r) {
    // events ~ [[start, finish, repetition, exceptions, isFixed, isRecurring] ...]
    // start ~ Date(ISOString)
    if (l >= r) {
        return
    }
    const m = l + parseInt((r-1)/2)
    mergeSortByStart(events, l, m)
    mergeSortByStart(events, m+1, r)
    mergeHelper(events, l, m, r)
}

app.post("/v1/calendar/post", async(req, res) => {
    const client = await pool.connect()
    const { userId, calendarInfo, timezone } = req.body

    const current = DateTime.now().setZone(timezone)
    const beginTime = DateTime.fromISO(current.minus({ days: current.weekday }).toISODate())
    
    try {
        // automatically generate calendarId, eventId
        // insert into calendars, events, events_meta
        const calendarQuery = await client.query(`
        UPDATE user_schema.users
        SET
        calendars = calendars + 1
        WHERE userId=$1
        RETURNING calendars`, [userId])
        const calendarId = calendarQuery.rows[0].calendars
        await client.query(`INSERT INTO user_schema_meta.calendars (userId, calendarId, numEvents, minId, timezone, beginTime) VALUES
        ($1, $2, 0, 0, $3, $4)`, [userId, calendarId, timezone, beginTime])
        let minId = 0
        let maxId = 0
        let eventsArr = []
        for (e in calendarInfo) {
            const { isFixed, isRecurring, start, finish, repetition, exceptions } = e
            minId = Math.min(minId, findIntervals(beginTime, finish, timezone))
            maxId = Math.max(maxId, findIntervals(beginTime, finish, timezone))
            
            eventsArr.push({
                isFixed: isFixed,
                isRecurring: isRecurring,
                start: new Date(start),
                startISO: start,
                finish: finish,
                repetition: repetition,
                exceptions: exceptions
            })
        }

        mergeSortByStart(eventsArr, 0, eventsArr.length - 1)

        for (let i = 0; i < eventsArr.length; i += 1) {
            const { isFixed, isRecurring, startISO, finish, repetition, exceptions } = eventsArr[i]
            await client.query(`INSERT INTO user_schema_meta.events (userId, calendarId, eventId, isFixed, isRecurring) VALUES
            ($1, $2, $3, $4, $5)`, [userId, calendarId, i + 1, isFixed, isRecurring])
            await client.query(`INSERT INTO user_schema_meta.events_meta (userId, calendarId, eventId, start, finish, repetition, exceptions) VALUES
            ($1, $2, $3, $4, $5, $6, $7)`, [userId, calendarId, i + 1, startISO, finish, repetition, exceptions])
        }

        await client.query(`
        UPDATE user_schema_meta.calendars
        SET
        numEvents = $1
        minId = $2
        maxId = $3
        WHERE userId=$4 AND calendarId=$5
        `, [eventsArr.length, minId, maxId, userId, calendarId])
        res.status(200).send(`Added calendar ${calendarId}`)
    } catch(err) {
        res.status(400).send(`Error when making calendar: \n ${err}`)
        console.log(err)
    } finally {
        client.release()
    }
})


app.get("/v1/calendar/:userId/:calendarId", async(req, res) => {
    const client = await pool.connect()
    const userId = req.params.userId
    const calendarId = req.params.calendarId
    try {
        const calendarQuery = await client.query(`SELECT minId, maxId, numEvents, timezone, beginTime FROM user_schema_meta.calendars WHERE userId=$1 AND calendarId=$2`, [userId, calendarId])
        const calendarInfo = calendarQuery.rows[0]
       
        const minId = calendarInfo.minid
        const maxId = calendarInfo.maxid
        const numEvents = calendarInfo.numevents
        const timezone = calendarInfo.timezone
        const beginTime = calendarInfo.timezone

        const timeStamp = DateTime.now().setZone(timezone)
        const newBeginTime = DateTime.fromISO(timeStamp.minus({ days: timeStamp.weekday }).toISODate())

        const intervalsToNewBegin = findIntervals(beginTime, newBeginTime, timezone)
        if (intervalsToNewBegin > maxId) {
            res.status(200).send({})
        }

        // range from newBeginTime to maxId  No
        // rename old calendarInfo. set calendarInfo to set events in calendar
        // range over 
        const newTimeStamp = timestamp.now()
        const newNumEvents = numEvents - offset
        await client.query(`
        UPDATE user_schema_meta.calendars 
        SET
        numEvents=$1
        minId = $2
        timezone= $3
        timestamp = $4
        WHERE userId = $5 AND calendarId=$6`, [newNumEvents, newMinId, timezone, newTimeStamp, userId, calendarId])
        let calendarArray = []
        for (let i = newMinId; i < newMinId + newNumEvents; i += 1) {
            const eventQuery = await client.query(`SELECT * FROM user_schema_meta.events WHERE userId=$1 AND calendarId=$2 AND eventId=$3`, [userId, calendarId, i])
            const eventInfo = eventQuery.rows[0]
            const eventMetaQuery = await client.query(`SELECT * FROM user_schema_meta.events_meta WHERE userId=$1 AND calendarId=$2 AND eventId=$3`, [userId, calendarId, i])
            const eventsMetaInfo = eventMetaQuery.rows[0]
            const repetition = eventsMetaInfo.repetition

            // find current week
            // find current day from Date()
            // find start and end times for week in unix timestamp
            // stop for loop if start time of event is past week end
            // for repetitions, stop inner for loop if start of repeated 
            //  event is past week end or past event end
            // if concurring events, call error: overlapping events + location of overlap + option to update schedule manually or automatically
            // repetition edge cases: end of repetition within but start outside or start of repetition within but end outside of week.

            currentDate = newTimeStamp
            const timeOffset = 0
            switch(timezone) {
                case "utc": timeOffset = utcOffset
                case "pst": timeOffset = pstOffset
                case "et": timeOffset = etOffset
            }

            const accountedTimeStamp = newTimeStamp + offset
            if (repetition > 0) {
                new Date().get
            }
        }
    } catch(err) {
        
    } finally {

    }
})
// login API

// req.user : {userId:int}

// listener

app.listen(port, () => console.log(`Listening on localhost:${port}`))