/*!
[Digital Touch](https://support.apple.com/guide/ipod-touch/send-a-digital-touch-effect-iph3fadba219/ios) messages are animated sketches, taps, fireballs, kisses, and heartbeats.
*/

pub use crate::message_types::digital_touch::{
    digital_touch_proto::TouchKind as DigitalTouch, models::from_payload,
};

pub(crate) mod digital_touch_proto;
pub mod models;
