use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct VectorClock {
    pub clocks: HashMap<String, u64>,
}

impl VectorClock {
    pub fn new() -> Self {
        Self { clocks: HashMap::new() }
    }

    pub fn increment(&mut self, node_id: &str) {
        let counter = self.clocks.entry(node_id.to_string()).or_insert(0);
        *counter += 1;
    }

    pub fn merge(&mut self, other: &VectorClock) {
        for (node, &count) in &other.clocks {
            let entry = self.clocks.entry(node.clone()).or_insert(0);
            *entry = (*entry).max(count);
        }
    }

    pub fn is_concurrent_with(&self, other: &VectorClock) -> bool {
        let self_greater = self.clocks.iter().any(|(k, &v)| v > *other.clocks.get(k).unwrap_or(&0));
        let other_greater = other.clocks.iter().any(|(k, &v)| v > *self.clocks.get(k).unwrap_or(&0));
        self_greater && other_greater
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncCursor {
    pub workspace_id: String,
    pub last_revision: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn increment_same_node_twice() {
        let mut clock = VectorClock::new();
        clock.increment("A");
        clock.increment("A");
        assert_eq!(clock.clocks["A"], 2);
    }

    #[test]
    fn increment_different_nodes() {
        let mut clock = VectorClock::new();
        clock.increment("A");
        clock.increment("B");
        assert_eq!(clock.clocks["A"], 1);
        assert_eq!(clock.clocks["B"], 1);
    }

    #[test]
    fn merge_takes_max_per_node() {
        let mut a = VectorClock::new();
        a.clocks.insert("x".into(), 2);
        a.clocks.insert("y".into(), 1);

        let mut b = VectorClock::new();
        b.clocks.insert("x".into(), 1);
        b.clocks.insert("y".into(), 3);

        a.merge(&b);
        assert_eq!(a.clocks["x"], 2);
        assert_eq!(a.clocks["y"], 3);
    }

    #[test]
    fn merge_adds_keys_from_other() {
        let mut a = VectorClock::new();
        a.clocks.insert("x".into(), 1);

        let mut b = VectorClock::new();
        b.clocks.insert("y".into(), 2);

        a.merge(&b);
        assert_eq!(a.clocks["x"], 1);
        assert_eq!(a.clocks["y"], 2);
    }

    #[test]
    fn concurrent_when_both_have_greater_counter() {
        let mut a = VectorClock::new();
        a.clocks.insert("x".into(), 2);
        a.clocks.insert("y".into(), 1);

        let mut b = VectorClock::new();
        b.clocks.insert("x".into(), 1);
        b.clocks.insert("y".into(), 2);

        assert!(a.is_concurrent_with(&b));
        assert!(b.is_concurrent_with(&a)); // symmetric
    }

    #[test]
    fn not_concurrent_when_one_dominates() {
        let mut a = VectorClock::new();
        a.clocks.insert("x".into(), 2);
        a.clocks.insert("y".into(), 2);

        let mut b = VectorClock::new();
        b.clocks.insert("x".into(), 1);
        b.clocks.insert("y".into(), 1);

        assert!(!a.is_concurrent_with(&b));
        assert!(!b.is_concurrent_with(&a));
    }

    #[test]
    fn not_concurrent_when_equal() {
        let mut a = VectorClock::new();
        a.clocks.insert("x".into(), 1);

        let mut b = VectorClock::new();
        b.clocks.insert("x".into(), 1);

        assert!(!a.is_concurrent_with(&b));
    }

    #[test]
    fn empty_clocks_not_concurrent() {
        let a = VectorClock::new();
        let b = VectorClock::new();
        assert!(!a.is_concurrent_with(&b));
    }
}
