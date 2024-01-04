import { DateTime } from 'luxon'

const testTime = DateTime.now()
const weekBeginning = DateTime.fromISO(testTime.minus({ days: testTime.weekday }).toISODate())
testTime.setZone("America/Los Angeles")

console.log(weekBeginning.toString())
console.log(weekBeginning.year)


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