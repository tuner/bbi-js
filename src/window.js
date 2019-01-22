import RequestWorker from './requestWorker'

const LRU = require('quick-lru')

export default class Window {
  /**
   * View into a subset of the data in a BigWig file.
   *
   * Adapted by Robert Buels from bigwig.js in the Dalliance Genome
   * Explorer by Thomas Down.
   * @constructs
   */
  constructor(bwg, cirTreeOffset, cirTreeLength, isSummary, autoSql) {
    this.bwg = bwg
    this.autoSql = autoSql
    if (!(cirTreeOffset >= 0)) throw new Error('invalid cirTreeOffset!')
    if (!(cirTreeLength > 0)) throw new Error('invalid cirTreeLength!')

    this.cirTreeOffset = cirTreeOffset
    this.cirTreeLength = cirTreeLength
    this.isSummary = isSummary

    function countFeatures(features) {
      if (!features) return 0
      let total = features.length
      features.forEach(feature => {
        total += countFeatures(feature.children())
      })
      return total
    }
    this.featureCache = new LRU({
      maxSize: 500000, // cache up to 50000 features and subfeatures
    })
  }

  readWigData(chrName, min, max) {
    // console.log( 'reading wig data from '+chrName+':'+min+'..'+max);
    const chr = this.bwg.header.refsByName[chrName]
    console.log(chr,'test')
    if (!chr) {
      return []
    } else {
      return this.readWigDataByIdWithCache(chr.id, min, max)
    }
  }

  readWigDataByIdWithCache(chr, min, max) {
    let ret = this.featureCache.get([chr, min, max])
    if(!ret) {
      ret = this.readWigDataById(chr, min, max)
      this.featureCache.set([chr, min, max], ret)
    }
    return ret
  }

  async readWigDataById(chr, min, max) {
    if (!this.cirHeader) {
      const readCallback = async () => {
        return this.readWigDataById(chr, min, max)
      }
      if (this.cirHeaderLoading) {
        this.cirHeaderLoading.push(readCallback)
      } else {
        this.cirHeaderLoading = [readCallback]
        // dlog('No CIR yet, fetching');
        const buffer = Buffer.alloc(48)
        await this.bwg.bbi.read(buffer,
          0,
          48,
          this.cirTreeOffset)
        this.cirHeader = buffer
        this.cirBlockSize = buffer.readUInt32LE(4) //TODO little endian?
        return Promise.all(this.cirHeaderLoading.map(c => c()))
        delete this.cirHeaderLoading
      }
      return
    }

    // dlog('_readWigDataById', chr, min, max, callback);

    const worker = new RequestWorker(
      this,
      chr,
      min,
      max
    )
    worker.cirFobRecur([this.cirTreeOffset + 48], 1)
  }
}
