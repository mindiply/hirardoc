import {TestNormalizeDocument} from './testTypes'

const emptyTestDocyment = (): TestNormalizeDocument => ({
  maps: {
    Node: new Map([1, {
      _id: 1,

    }]),

  }
});
