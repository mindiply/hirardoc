import {ILazyMutableMap, ILazyMutableMapDelta} from './HTypes';

interface EqualityFn<T> {
	(left: T, right: T): boolean;
}

const defaultEquals: EqualityFn<any> = (left: any, right: any) =>
	left === right;

export class LazyMutableMap<K, V> implements ILazyMutableMap<K, V> {
	protected readonly originalValuesMap: Map<K, V>;
	protected valuesMap: Map<K, V>;
	protected added: Map<K, V>;
	protected changed: Map<K, V>;
	protected deleted: Set<K>;
	private equalityFn: EqualityFn<V>;

	constructor(
		originalMap: Map<K, V>,
		equalityFn: EqualityFn<V> = defaultEquals
	) {
		this.valuesMap = this.originalValuesMap = originalMap;
		this.added = new Map();
		this.changed = new Map();
		this.deleted = new Set();
		this.equalityFn = equalityFn;
	}

	public hasChanged = (): boolean => {
		return this.originalValuesMap !== this.valuesMap;
	};

	public clear = () => {
		if (this.originalValuesMap.size === 0 && this.valuesMap.size === 0) {
			return;
		}
		this.createCopyIfNeeded();
		for (const key of this.originalValuesMap.keys()) {
			this.deleted.add(key);
		}
		this.valuesMap.clear();
	};

	public set = (key: K, value: V): LazyMutableMap<K, V> => {
		if (
			this.valuesMap === this.originalValuesMap &&
			this.valuesMap.has(key) &&
			this.equalityFn(this.originalValuesMap.get(key)!, value)
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
