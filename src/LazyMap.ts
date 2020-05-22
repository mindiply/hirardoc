/**
 * A lazy mutable delta represents the differences between the map the
 * lazy mutable map was initialized with and the change operations that have
 * subsequently been performed on it.
 */
export interface ILazyMutableMapDelta<K, V> {
  added: Map<K, V>;
  changed: Map<K, V>;
  deleted: Set<K>;
}

/**
 * Wraps a Javascript map, creating lazily a new shallow copy if
 * we perform changes on it.
 *
 * It allows using the object as a mutable map and return a new copy
 * only if any changes happened withing some potentially mutating code.
 *
 * The typical use is withing non-trivial reducers, where changes may
 * happen after a number of different conditions, and where we don't want
 * to create a new map if we don't need to nor keep checking if we need a new
 * version of the original map.
 */
export interface ILazyMutableMap<K, V> {
  hasChanged: () => boolean;
  has: (key: K) => boolean;
  set: (key: K, value: V) => ILazyMutableMap<K, V>;
  get: (key: K) => undefined | V;
  getOriginal: (key: K) => undefined | V;
  delete: (key: K) => boolean;
  keys: () => IterableIterator<K>;
  values: () => IterableIterator<V>;
  getMap: () => Map<K, V>;
  delta: () => ILazyMutableMapDelta<K, V>;
}

export class LazyMutableMap<K, V> implements ILazyMutableMap<K, V> {
  protected readonly originalValuesMap: Map<K, V>;
  protected valuesMap: Map<K, V>;
  protected added: Map<K, V>;
  protected changed: Map<K, V>;
  protected deleted: Set<K>;

  constructor(originalMap: Map<K, V>) {
    this.valuesMap = this.originalValuesMap = originalMap;
    this.added = new Map();
    this.changed = new Map();
    this.deleted = new Set();
  }

  public hasChanged = (): boolean => {
    return this.originalValuesMap !== this.valuesMap;
  };

  public set = (key: K, value: V): LazyMutableMap<K, V> => {
    if (
      this.valuesMap === this.originalValuesMap &&
      this.valuesMap.has(key) &&
      this.originalValuesMap.get(key) === value
    ) {
      return this;
    }
    this.createCopyIfNeeded();
    this.valuesMap.set(key, value);
    if (this.deleted.has(key)) {
      this.deleted.delete(key);
    }
    if (this.originalValuesMap.has(key)) {
      if (this.originalValuesMap.get(key) !== value) {
        this.changed.set(key, value);
      } else {
        if (this.changed.has(key)) {
          this.changed.delete(key);
        }
      }
    } else {
      this.added.set(key, value);
    }
    return this;
  };

  public get = (key: K): undefined | V => this.valuesMap.get(key);

  public has = (key: K): boolean => this.valuesMap.has(key);

  public delete = (key: K): boolean => {
    if (!this.valuesMap.has(key)) {
      return false;
    }
    this.createCopyIfNeeded();
    this.deleted.add(key);
    if (this.added.has(key)) {
      this.added.delete(key);
    }
    if (this.changed.has(key)) {
      this.changed.delete(key);
    }
    return this.valuesMap.delete(key);
  };

  public getMap = (): Map<K, V> => this.valuesMap;

  public keys = (): IterableIterator<K> => this.valuesMap.keys();

  public values = (): IterableIterator<V> => this.valuesMap.values();

  protected createCopyIfNeeded = () => {
    if (this.originalValuesMap === this.valuesMap) {
      this.valuesMap = new Map(this.originalValuesMap.entries());
    }
  };

  public getOriginal = (key: K): undefined | V =>
    this.originalValuesMap.get(key);

  public delta = (): ILazyMutableMapDelta<K, V> => {
    return {
      added: this.added,
      changed: this.changed,
      deleted: this.deleted
    };
  };
}
