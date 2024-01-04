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
const timezone = "America/Los Angeles"

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

app.post("/v1/calendar/post", async(req, res) => {
    const client = await pool.connect()
    const { userId, calendarInfo } = req.body

    try {
        const calendarQuery = await client.query(`UPDATE user_schema.users SET calendars = calendars + 1 WHERE userId = $1 RETURNING calendars`, [userId])
        const calendarId = calendarQuery.rows[0].calendars
        await client.query(`INSERT INTO user_schema_meta.calendars (userId, calendarId, numEvents, timezone) VALUES ($1, $2, $3, $4)`, [userId, calendarId, calendarInfo.length, timezone])
        for (let i = 0; i < calendarInfo.length; i += 1) {
            const e = calendarInfo[i]
            const { tiedEvents, isFixed, isRecurring, start, finish, repetition } = e
            
            const date = DateTime.fromISO(start)
            
            await client.query(`INSERT INTO user_schema_meta.calendars_meta (userId, calendarId, eventId, timestamp, edges, intervalsLasting) VALUES 
            ($1, $2, $3, $4, $5, $6)`, [userId, calendarId, i, date, findEdges(start, finish, 24 * 60), findIntervals(start, finish)])
            await client.query(`INSERT INTO user_schema_meta.events (userId, calendarId, eventId, tiedEvents, isFixed, isRecurring) VALUES
            ($1, $2, $3, $4, $5, $6)`, [userId, calendarId, i, tiedEvents, isFixed, isRecurring])
            await client.query(`INSERT INTO user_schema_meta.recurringEvents (userId, calendarId, eventId, repetition) VALUES
            ($1, $2, $3, $4)`, [userId, calendarId, i, repetition])
        }
        res.status(200).send("Successfully added calendar")
    } catch(err) {
        res.status(400).send(`Error in processing calendar \n ${err}`)
    } finally {
        client.release()
    }
})

app.get("/v1/calendar/:userId/:calendarId", async(req, res) => {
    const client = await pool.connect()
    const userId = req.params.userId
    const calendarId = req.params.calendarId
    const { window, desiredDate } = req.body

    try {
        const desiredTime = DateTime.fromISO(desiredDate).zone(timezone)
        const startDate = DateTime.fromISO(desiredTime.minus({ daysOfWeek: desiredTime.weekday }).toISODate()).zone(timezone)
        
        // event ids
        let events = [] 

        let currentDate = startDate
        while (currentDate < startDate.plus({days: window})) {
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
        res.status(200).send(events)
    } catch(err) {
        res.status(400).send("An error occurred when retrieving calendar information")
    } finally {
        client.release()
    }
})

// login API

// req.user : {userId:int}

// listener

app.listen(port, () => console.log(`Listening on localhost:${port}`))