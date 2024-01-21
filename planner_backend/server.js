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
import { DateTime } from "luxon"
import MaxHeapEvent from "./MaxHeap.js"

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
const timezone = "America/Los Angeles"

// Pusher config 

const pusher = new Pusher({
    appId: process.env.APP_ID,
    key: process.env.KEY,
    secret: process.env.SECRET,
    cluster: process.env.CLUSTER
})

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
// integrate importance API call for events

function findIntervals(beginTime, timeStamp) {
    const secondsDifference = (new Date(timeStamp).getTime() - new Date(beginTime).getTime()) / 1000
    return Math.floor(secondsDifference / 900)
}

function findEdges(startTime, endTime, sectionLength) { // sectionLength in mins

    const start = DateTime.fromISO(startTime).plus({seconds: 30}).setZone(timezone)
    const end = DateTime.fromISO(endTime).minus({seconds: 30}).setZone(timezone)

    const firstEdgeTime = Math.floor((start.minute + start.hour * 60) / sectionLength) * sectionLength 
    const firstEdgeHour = Math.floor(firstEdgeTime / 60)
    const firstEdgeMinutes = firstEdgeTime - firstEdgeHour * 60 
    
    const firstEdge = DateTime.fromObject({
        year: start.year,
        month: start.month,
        day: start.day,
        hour: firstEdgeHour,
        minute: firstEdgeMinutes
    }).setZone(timezone)

    let i = 0
    const edgeArr = []
    while (firstEdge.plus({minutes: sectionLength * i}) < end) {
        edgeArr.push(firstEdge.plus({minutes: sectionLength * i}).toISO())
        i += 1
    }
    
    return edgeArr
}

async function insertIntoEvents(events, currentEvent, eventId, userId, calendarId) {
    const eventsLength = events.length
    let start = 0
    let end = eventsLength - 1
    let middle;
    const client = await pool.connect()
    // find index i where events[i] <= currentEvent < events[i+1]
    while (end > start) {

        middle = Math.floor((start + end) / 2)
        const timeQuery = await client.query(`SELECT timeStamp, intervalsLasting FROM user_schema_meta.calendars_meta WHERE 
        userId=$1 AND calendarId=$2 AND eventId = $3`, [userId, calendarId, events[middle]])
        const timeStamp = timeQuery.timestamp
        const intervalslasting = timeQuery.intervalslasting

        if (currentEvent > timeStamp) {
            start = middle + 1
        } else {
            end = middle 
        }
    }


}

app.post("/v1/calendar/post", async(req, res) => {
    const client = await pool.connect()
    const { userId, calendarInfo } = req.body

    try {
        const calendarQuery = await client.query(`UPDATE user_schema.users SET calendars = calendars + 1 WHERE userId = $1 RETURNING calendars`, [userId])
        const calendarId = calendarQuery.rows[0].calendars
        await client.query(`INSERT INTO user_schema_meta.calendars (userId, calendarId, numEvents, timezone) VALUES ($1, $2, $3, $4)`, [userId, calendarId, calendarInfo.length, timezone])
        for (let i = 0; i < calendarInfo.length; i += 1) {
            const e = calendarInfo[i]
            const { tiedEvents, isFixed, isRecurring, importance, description, start, finish, repetition, timeout } = e
            
            const date = DateTime.fromISO(start)
            
            await client.query(`INSERT INTO user_schema_meta.calendars_meta (userId, calendarId, eventId, timestamp, edges, intervalsLasting) VALUES 
            ($1, $2, $3, $4, $5, $6)`, [userId, calendarId, i, date, findEdges(start, finish, 24 * 60), findIntervals(start, finish)])
            await client.query(`INSERT INTO user_schema_meta.events (userId, calendarId, eventId, tiedEvents, isFixed, isRecurring, importance, description) VALUES
            ($1, $2, $3, $4, $5, $6, $7, $8)`, [userId, calendarId, i, tiedEvents, isFixed, isRecurring, importance, description])
            await client.query(`INSERT INTO user_schema_meta.recurringEvents (userId, calendarId, eventId, repetition, timeout) VALUES
            ($1, $2, $3, $4, $5)`, [userId, calendarId, i, repetition, timeout])
        }
        res.status(200).send("Successfully added calendar")
    } catch(err) {
        res.status(400).send(`Error in processing calendar \n ${err}`)
    } finally {
        client.release()
    }
})

// returns list of eventIds such that each eventId corresponds to events done in order of time. Last element may extend out of window.
app.get("/v1/calendar/:userId/:calendarId", async(req, res) => {
    const client = await pool.connect()
    const { userId, calendarId } = req.params
    const { window, desiredDate } = req.body

    try {
        const desiredTime = DateTime.fromISO(desiredDate).zone(timezone)
        const startDate = DateTime.fromISO(desiredTime.minus({ day: desiredTime.weekday }).toISODate()).zone(timezone)
        const endDate = startDate.plus({days: window})
        
        // event ids
        let events = [] 

        let currentDate = startDate
        while (currentDate < endDate) {
            const calendarMetaQuery = await client.query(`SELECT eventId, intervalsLasting, timeStamp FROM user_schema_meta.calendars_meta WHERE
            userId=$1 AND calendarId=$2 AND (timeStamp=$3 OR $3 = ANY(edges))`, [userId, calendarId, currentDate.toISO()])
            const calendarMetaInfo = calendarMetaQuery.rows[0]
            const eventId = calendarMetaInfo.eventid
            const timeStamp = calendarMetaInfo.timestamp
            const intervalsLasting = calendarMetaInfo.intervalslasting

            const eventBegin = DateTime.fromISO(timeStamp).zone(timezone)
            currentDate = eventBegin.plus({minutes: intervalsLasting * 15})
            events.push(eventId)
        }

        const eventQuery = await client.query(`SELECT eventId, repetition, timeout FROM user_schema_meta.recurringEvents WHERE userId=$1 AND calendarId=$2`, [userId, calendarId])
        const eventsInfo = eventQuery.rows.map(row => [row.eventid, row.timeout])
        for (const eventInfo in eventsInfo) {
            // check start before end and timeout after start of window
            // while loop over every instance within window and insert into events with binary search

            const eventId = eventInfo.eventid
            const timeout = eventInfo.timeout
            const repetition = eventInfo.repetition

            const calendarMetaQuery = await client.query(`SELECT timeStamp, intervalsLasting FROM user_schema_meta.calendars_meta WHERE 
            userId=$1 AND calendarId=$2 AND eventId=$3`, [userId, calendarId, eventId])
            const calendarMetaInfo = calendarMetaQuery.rows[0]
            const timeStamp = DateTime.fromISO(calendarMetaInfo.timestamp).zone(timezone)
            const intervalsLasting = calendarMetaInfo.intervalslasting

            if (timeStamp >= endDate || timeout <= startDate) {
                continue
            }

            let currentEvent = timeStamp
            while (currentEvent < timeout && currentEvent < endDate) { // event in window
                if (currentEvent < startDate) {
                    currentEvent = currentEvent.plus({minutes: repetition})
                    continue
                }
                insertIntoEvents(events, currentEvent, eventId, userId, calendarId)
            } 
        }
        res.status(200).send(events)
    } catch(err) {
        res.status(400).send("An error occurred when retrieving calendar information")
    } finally {
        client.release()
    }
})

// update get

app.delete("/v1/calendar/delete/:userId/:calendarId/:eventId/:instance", async(req, res) => {
    const {userId, calendarId, eventId, instance } = req.params
    // instance is an ISO string
    const client = await pool.connect()
    try {
        const recurQuery = await client.query(`SELECT isRecurring FROM user_schema_meta.events WHERE userId=$1 AND calendarId=$2 AND eventId=$3`,
        [userId, calendarId, eventId])
        const isRecurring = recurQuery.rows[0].isrecurring
        if (isRecurring) {
            await client.query(`UPDATE user_schema_meta.recurringEvents SET exceptions = ARRAY_APPEND(exceptions, $1) 
            WHERE userId=$2 AND calendarId=$3 AND eventId=$4`, [instance, userId, calendarId, eventId])
        } else {
            await client.query(`
            DO $$ 
            DECLARE 
                tiedEvent INTEGER;
            BEGIN
                FOR tiedEvent IN 
                    SELECT unnest(tiedEvents) FROM user_schema_meta.events WHERE userId=$2 AND calendarId=$3 AND eventId=$1;
                LOOP
                    UPDATE user_schema_meta.events SET tiedEvents=ARRAY_REMOVE(tiedEvents, $1) WHERE userId=$2 AND calendarId=$3 AND eventId=tiedEvent;
                END LOOP;
                DELETE FROM user_schema_meta.events WHERE userId=$2 AND calendarId=$3 AND eventId=$1;
            END $$`, [eventId, userId, calendarId])
        }
        res.status(200).send(`Deleted event from calendar \n 
        ${{
            calendarId: calendarId,
            eventId: eventId,
        }}`)
    } catch(err) {
        res.status(400).send(`Error occurred when deleting event \n ${err}`)
        console.log(err)
    } finally {
        client.release()
    }
    
})

// after merge service
app.delete("/v1/calendar/delete/:userId/:calendarId", async(req, res) => {

})

// update API

// Eventually: maybe have cliques be able to choose subdays?

// first index is min hour. second is max hour. 
const subdays = {
    sleep: [0, 7],
    morning: [8, 12],
    afternoon: [13, 18],
    evening: [19, 23]
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
        if (L[i].importance <= R[j].importance) {
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

function orderEventsByImportance(events, l, r) {
    // least important event first
    if (l >= r) {
        return
    }
    const m = l + parseInt((r-1)/2)
    orderEventsByImportance(events, l, m)
    orderEventsByImportance(events, m+1, r)
    mergeHelper(events, l, m, r)
}

function addToStack(events, stack) {
    for (let event in events) {
        stack.push(event)
    }
}

function isImportant(importance) {
    if (importance >= 5) {
        return true
    }
    return false
}

function addEventToProperHeap(event, nightHeap, morningHeap, afternoonHeap, eveningHeap) {
    const timestamp = DateTime.fromISO(event.desiredTime).zone(timezone)
    const hour = timestamp.hour
    
    if (hour >= subdays.sleep[0] && hour <= subdays.sleep[1]) {
        nightHeap.add(event)
    } else if (hour >= subdays.morning[0] && hour <= subdays.morning[1]) {
        morningHeap.add(event)
    } else if (hour >= subdays.afternoon[0] && hour <= subdays.afternoon[1]) {
        afternoonHeap.add(event)
    } else if (hour >= subdays.evening[0] && hour <= subdays.evening[1]) {
        eveningHeap.add(event)
    }
}

app.post("/v1/update/", async(req, res) => {
    // 'event': {
    //     localEventId: int (for ledger)
    //     deadline: (some text) 
    //     description: "a",
    //     desiredTime: str
    //     -- must find edges --
    //     intervalsLasting: int   
    //     tiedEvents:[eventIds ...],
    //     isFixed: bool,
    //     isRecurring: bool,
    //     importance: int default 5,
    //     repetition: int,
    //     timeout: int,
    //     exceptions:["a", ...]
    //     updateStatus: 'replacement' or 'mutation'. 

    // }

    // first add 'event' to ledger. Then 
    // deal with replacements first. Finally
    // think about mutations

    // mutations cannot recur for now

    // below is eventsList for mutations only

    // eventsList: {
    //     localEventId: int,
    //     deadline: str,
    //     desiredTime: str,
    //     intervalsLasting: int,
    //     importance: int,

    // }

    const { userId, calendarId, eventsList } = req.body
    const client = await pool.connect()
    // check if overlaps fixed task. If so, throw error
    
    // first address events for morning. Then afternoon. Then evening. Pop events with max importance from each of these heaps. Have separate heap containing displaced events.
    const nightHeap = new MaxHeapEvent()
    const morningHeap = new MaxHeapEvent()
    const afternoonHeap = new MaxHeapEvent()
    const eveningHeap = new MaxHeapEvent()
    const displacedHeap = new MaxHeapEvent()

    for (let event in eventsList) {
        addEventToProperHeap(event, nightHeap, morningHeap, afternoonHeap, eveningHeap)
    }

    while (displacedHeap.size() <= 8) {
        while (!morningHeap.isEmpty()) {
            const event = morningHeap.pop()
            const desiredStart = DateTime.fromISO(event.desiredTime).zone(timezone)
            const intervalsLength = event.intervalsLasting
            // find desired start date and find events which begin before desiredStart starting from latest to earliest
            
            let startInterval = desiredStart.minus({ minutes: 15 })
            const eventId = null;
            // find last event that starts prior to a.
            while (startInterval >= desiredStart.minus({ minutes: desiredStart.hour * 60 + desiredStart.minute })) {
                const eventQuery = await client.query(`SELECT eventId FROM user_schema_meta.calendars_meta WHERE userId=$1 AND calendarId=$2 AND timeStamp=$3`, 
                [userId, calendarId, startInterval.toISO()])
                // decrement event search pointer
                startInterval = startInterval.minus({ minutes: 15 })
                if (eventQuery.rows.length === 0) {
                    continue
                }
                eventId = eventQuery.rows[0].eventid
                break
            }
        }
    }

    
})

// merge API

const mergeChannel = pusher.subscribe("mergeChannel")
mergeChannel.bind("mergeEventCalendarLists", function(data) {

})

// must call python function 
app.post("/v1/merge", async(req, res) => {
    // calendarEventList: [{
    //     userId: ,
    //     calendarId: ,
    //     eventId: ,
    // }, ...]

    // weightsList: [w_1, w_2, w_3, \ldots, w_n]

    const { calendarEventList, weightsList } = req.body
    pusher.trigger("mergeChannel", "mergeEventCalendarLists", {
        calendarEventList: calendarEventList,
        weightsList: weightsList
    })
})

// login API

// req.user : {userId:int}

// listener

app.listen(port, () => console.log(`Listening on localhost:${port}`))