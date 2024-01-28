import MaxHeapEvent from "./MaxHeap"
import Stack from "./Stack"

import { DateTime } from "luxon"

//     event: {
    //     localEventId: int,
    //     type: inputted or displaced 
    //     deadline: str (optional),
    //     desiredTime: str,
    //     intervalsLasting: int,
    //     importance: int,
    //     timeout: int (optional) 
    // }

class UpdateList {

    static subdays = {
        night: [0, 7],
        morning: [8, 12],
        afternoon: [13, 18],
        evening: [19, 23]
    }

    constructor(client, userId, calendarId, defaultTimeout, displacedLimit, timezone) {
        this.client = client
        this.userId = userId
        this.calendarId = calendarId
        this.defaultTimeout = defaultTimeout
        this.displacedLimit = displacedLimit
        this.updateMap = new Map()
        this.overflowMap = new Map()
        this.displacedHeap = new MaxHeapEvent()
        this.timezone = timezone
        
    }

    floor(time) {
        const hour = time.hour
        const minute = time.minute
        return time.minus({ minutes: hour * 60 + minute })
    }

    addToSubday(event, map) {
    
        const subdays = UpdateList.subdays
        const desiredTime = event.desiredTime
        const desiredDay = floor(desiredTime)
        if (desiredTime.hour >= subdays.night[0] && desiredTime.hour <= subdays.night[1]) {
            map.get(desiredDay).night.add(event)
        } else if (desiredTime.hour >= subdays.morning[0] && desiredTime.hour <= subdays.morning[1]) {
             map.get(desiredDay).morning.add(event)
        } else if (desiredTime.hour >= subdays.afternoon[0] && desiredTime.hour <= subdays.afternoon[1]) {
            map.get(desiredDay).afternoon.add(event)
        } else if (desiredTime.hour >= subdays.evening[0] && desiredTime.hour <= subdays.evening[1]) {
            map.get(desiredDay).evening.add(event)
        }
    }

    addEvent(event) {

        if (event.type != "inputted") {
            return
        }

        const desiredTime = DateTime.fromISO(event.desiredTime).zone(this.timezone)
        const desiredDay = floor(desiredTime)
        if (!this.updateMap.has(desiredDay)) {
            this.updateMap.set(desiredDay, {
                night: new MaxHeapEvent(),
                morning: new MaxHeapEvent(),
                afternoon: new MaxHeapEvent(),
                evening: new MaxHeapEvent()
            })
        }

        this.addToSubday(event, this.updateMap)
        if (!this.overflowMap.has(0)) {
            this.overflowMap.set(0, [])
        }
        // All events added have been pushed past subday 0 times initially
        this.overflowMap.get(0).push(event)
    }

    addDisplacedEvent(event) {

        if (event.type != "displaced" || this.displacedHeap.size() >= this.displacedLimit) {
            return
        }
        this.displacedHeap.add(event)
        if (!this.overflowMap.has(0)) {
            this.overflowMap.set(0, [])
        }
        // All events added have been pushed past subday 0 times initially
        this.overflowMap.get(0).push(event)
    }


    // determine when writing algorithm
    next() {

    }
    
    orderEntries(map) {
        let arr = []
        for (const [key, value] in Object.entries(map)) {
            arr.push(key)
        }
        arr = arr.sort((a, b) => a - b)
        return arr
    }

    isImportant(importance) {
        return importance >= 6
    }

    timeToInterval(datetime) {
        return Math.floor(datetime.minute / 15) + datetime.hour * 4
    }

    // I wonder if we can use SIMD operations to speed up mass SQL queries 

    // Pushes only push within same day
    async pushEvents(eventIdsList, intervalsToPush, userId, calendarId) {
        const client = this.client
        for (const eventId in eventIdsList) {
            const dayQuery = await client.query(`SELECT startInterval FROM user_schema_meta.calendars_meta WHERE userId=$1 AND calendarId=$2 AND eventId=$3`, 
            [userId, calendarId, eventId])
            const startInterval = dayQuery.rows[0].startinterval
            const newStartInterval = startInterval + intervalsToPush
            await client.query(`UPDATE user_schema_meta.calendars_meta SET startInterval=$1 WHERE userId=$2 AND calendarId=$3 AND eventId=$4`,
            [newStartInterval, userId, calendarId, eventId])
        } 
    }

    shifting(startPointer, endPointer, startsMeta) {

    }

    async updateForInputted(event, subdayHeap, beginInterval) {
        const { client, userId, calendarId } = this
        const importance = event.importance
        const isImportant = isImportant(importance)
        const desiredTime = DateTime.fromISO(event.desiredTime).zone(this.timezone)
        const desiredInterval = this.timeToInterval(desiredTime)
        const intervalsLasting = event.intervalsLasting
       
        if (!isImportant) {
            const startIntervalQuery = await client.query(`SELECT eventId, startInterval, intervalsLasting, importance FROM user_schema_meta.calendars_meta WHERE 
            userId=$1 AND calendarId=$2 AND setStatus='FALSE' ORDER BY startInterval`, [userId, calendarId])
            const startsMeta = startIntervalQuery.rows.filter(({eventid, startinterval, intervalslasting, importance}) => startinterval >= beginInterval && startinterval <= desiredInterval).reverse()

            let currentEvent, currentBegin, currentDuration, currentImportance, prevEvent, prevBegin, prevDuration, prevImportance, gapDuration;

            let startFree, endFree;
            for (let i = 0; i < startsMeta.length - 1; i += 1) {

                currentEvent = startsMeta[i]
                currentBegin = currentEvent.startInterval
                currentDuration = currentEvent.intervalsLasting
                prevEvent = startsMeta[i + 1]
                prevBegin = prevEvent.startInterval
                prevDuration = prevEvent.intervalsLasting

                gapDuration = currentBegin - (prevBegin + prevDuration)
                
                const currentImportance = currentEvent.importance

                // const startPointer = nextBegin + nextDuration
                // const endPointer = currentBegin

                // BEST PRACTICE: append event to end of startList first. Then do mutations.

                startList.push({
                    startInterval: currentBegin,
                    importance: currentImportance
                })

                // filling up a present gap creates new gaps in future.
                // beginning, for any gaps in the future, they are too small to fill future events.

                // CASE:
                // event fills current gap > creates space greater than length of initial gap > this space filled and creates more space >...
                // >> stops when: event creates space not big enough to fill next unimportant event OR gap of desired duration made available.
                // >> FIND(): Then must find resulting gaps, and fill unimportant events
                
                // we let startList, and have a pointer pointing to earliest element in startList not yet encountered.
                // When we create new gap, 
                if (gapDuration > 0) {

                    for (let j = startList.length - 1; j >= 0; j -= 1) {
                       
                        currentEvent = startsMeta[j]
                        currentBegin = currentEvent.startInterval
                        currentDuration = currentEvent.intervalsLasting
                        prevEvent = startsMeta[j + 1]
                        prevBegin = prevEvent.startInterval
                        prevDuration = prevEvent.intervalsLasting

                        const gapLength = currentBegin - (prevBegin + prevDuration)

                        if (isImportant(importance)) {
                            conti
                        }
                    } 
                }
                
                
                if (isImportant(currentImportance) && gapDuration > 0) {
                    // take earliest non-important task passed through so far. Skip it past all the important events and see if its duration <= gapDuration. 
                    // >> If so, push. Else add to stack.

                    // casework. we may have unimportant event jumps over all important events resulting in space. this leaves left over space in its original position, 
                    // >> Process Name: Shifting
                    // >> but also potentially space in the first position. We must store 
                    // >> 1. the end of the latest unimportant item before the importants
                    // >> 2. the beginning of the importants
                    // >> 3. the end of the importants
                    // >> 4. the beginning of the second unimportants


                    // Exists many possible start and ends because many possible important events, so have list of starts and ends
                    // always try and fill the latest start-end gap

                    startEndList = [[prevBegin + prevDuration, currentBegin]]

                    let j = startList.length
                    let duration = 0



                    // below nonsense
                    startFree = prevBegin + prevDuration
                    endFree = currentBegin
                    nextStart = null 
                    nextEnd = null

                    

                    while (j >= 0) {

                        j -= 1
                        const event = startsMeta[j]
                        const importance = event.importance

                        if (isImportant(importance)) {
                            continue
                        }
                        
                        duration = event.intervalsLasting

                        if (gapDuration >= duration) {
                            event.startInterval = startFree
                            gapDuration -= duration
                            startFree += duration
                        } else {

                        }
                    }

                }

                // NOOOO

                if (gapDuration <= 0 || isImportant(currentImportance)) {
                    startList.push({
                        startInterval: currentBegin,
                        importance: currentImportance
                    })
                    continue
                }

            }

            }
        }
        // find last event that begins prior to desiredTime and find number of intervals it intersects with desired time.

    updateForDisplaced(evennt) {
        const isImportant = this.eventIsImportant(evennt)
    }

    updateSubday(subday, subdayHeap, beginInterval) {
        while (!subdayHeap.isEmpty()) {
            const inputtedEvent = subdayHeap.pop()
            const displacedEvent = null;
            // do not pop from displaced heap
            if (!this.displacedHeap.isEmpty()) {
                displacedEvent = this.displacedHeap.peek()
            }
            const eventMaxImportance = inputtedEvent
            if (displacedEvent != null && displacedEvent.importance > inputtedEvent.importance) {
                eventMaxImportance = displacedEvent
            }
            const eventType = eventMaxImportance.type
            if (eventType === "inputted") {
                this.updateForInputted(eventMaxImportance, subdayHeap, beginInterval)
            } else if (eventType === "displaced") {
                this.updateForDisplaced()
            }
        }
    }

    updateCalendar() {

        const orderedKeys = orderEntries(this.updateMap)
        for (const key in orderedKeys) {
            // first deal with morning, then afternoon, then evening, then night (nothing touches night. We just don't deal with it)
            const morningHeap = this.updateMap.get(key).morning
            if (!morningHeap.isEmpty()) {
                this.updateSubday(key, morningHeap, UpdateList.morning[0] * 4)
            }
        }
    }
}