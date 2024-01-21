// ranks by importance of events

class MaxHeapEvent {
    constructor() {
        this.heap = [null];
    }
    
    // Helper Methods
    getLeftChildIndex(parentIndex) { return 2 * parentIndex; }
    getRightChildIndex(parentIndex) { return 2 * parentIndex + 1; }
    
    getParentIndex(childIndex) {
        return Math.floor(childIndex / 2);
    }
    
    hasLeftChild(index) {
        return this.getLeftChildIndex(index) < this.heap.length;
    }
    
    hasRightChild(index) {
        return this.getRightChildIndex(index) < this.heap.length;
    }
    
    hasParent(index) {
        return this.getParentIndex(index) > 0;
    }
    
    leftChild(index) {
        return this.heap[this.getLeftChildIndex(index)].importance;
    }
    
    rightChild(index) {
        return this.heap[this.getRightChildIndex(index)].importance;
    }
    
    parent(index) {
        return this.heap[this.getParentIndex(index)].importance;
    }
    
    swap(indexOne, indexTwo) {
        const temp = this.heap[indexOne];
        this.heap[indexOne] = this.heap[indexTwo];
        this.heap[indexTwo] = temp;
    }
    
    peek() {
        if (this.heap.length === 1) {
            return null;
        }
        return this.heap[1];
    }
    
    // Removing an element will remove the
    // top element with highest priority then
    // heapifyDown will be called 
    pop() {
        if (this.heap.length === 1) {
            return null;
        }
        const item = this.heap[1];
        this.heap[1] = this.heap[this.heap.length - 1];
        this.heap.pop();
        this.heapifyDown();
        return item;
    }
    
    add(item) {
        this.heap.push(item);
        this.heapifyUp();
    }
    
    heapifyUp() {
        let index = this.heap.length - 1;
        while (this.hasParent(index) && this.parent(index) < this.heap[index]) {
            this.swap(this.getParentIndex(index), index);
            index = this.getParentIndex(index);
        }
    }
    
    heapifyDown() {
        let index = 1;
        while (this.hasLeftChild(index)) {
            let largerChildIndex = this.getLeftChildIndex(index);
            if (this.hasRightChild(index) && this.rightChild(index) > this.leftChild(index)) {
                largerChildIndex = this.getRightChildIndex(index);
            }
            if (this.heap[index] > this.heap[largerChildIndex]) {
                break;
            } else {
                this.swap(index, largerChildIndex);
            }
            index = largerChildIndex;
        }
    }

    size() {
        return this.heap.length - 1
    }

    isEmpty() {
        return this.heap.length === 1
    }
    
    printHeap() {
        var heap =` ${this.heap[0]} `
        for(var i = 1; i<this.heap.length;i++) {
            heap += ` ${this.heap[i]} `;
        }
        console.log(heap);
    }
}

export default MaxHeapEvent
    