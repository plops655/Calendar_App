class Gap {

    constructor(start = null, end = null, parent = -1) {
        // this.next not needed because it is implicit in LinkedListGaps.js

        // By not setting any parameters, we create a dummy object
        // The parent = - 1 means this Gap is by default the last gap before an unimportant event
        this.start = start
        this.end = end
        this.parent = parent
    }

    setParent(parent) {
        this.parent = parent
    }

    setStart(start) {
        this.start = start
    }

    setEnd(end) {
        this.end = end
    }

    getParent() {
        return this.parent
    }

    getStart() {
        return this.start
    }

    getEnd() {
        return this.end
    }
}

export default Gap