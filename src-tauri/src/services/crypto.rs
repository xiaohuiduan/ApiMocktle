use rand::RngCore;
use scrypt::{scrypt, Params};
use sha2::{Sha256, Digest};

pub fn hash_password(password: &str) -> Result<String, String> {
    let mut salt = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut salt);

    let mut hash = [0u8; 64];
    let params = Params::new(14, 8, 1, 64)
        .map_err(|e| format!("scrypt params error: {e}"))?;

    scrypt(password.as_bytes(), &salt, &params, &mut hash)
        .map_err(|e| format!("scrypt error: {e}"))?;

    Ok(format!("{}:{}", hex::encode(salt), hex::encode(hash)))
}

pub fn verify_password(password: &str, stored_hash: &str) -> bool {
    let parts: Vec<&str> = stored_hash.split(':').collect();
    if parts.len() != 2 {
        return false;
    }

    let salt = match hex::decode(parts[0]) {
        Ok(s) => s,
        Err(_) => return false,
    };

    let expected = match hex::decode(parts[1]) {
        Ok(h) => h,
        Err(_) => return false,
    };

    let params = match Params::new(14, 8, 1, 64) {
        Ok(p) => p,
        Err(_) => return false,
    };

    let mut calculated = [0u8; 64];
    if scrypt(password.as_bytes(), &salt, &params, &mut calculated).is_err() {
        return false;
    }

    // Constant-time comparison
    if calculated.len() != expected.len() {
        return false;
    }

    let mut diff = 0u8;
    for (a, b) in calculated.iter().zip(expected.iter()) {
        diff |= a ^ b;
    }

    diff == 0
}

pub fn sha256_hash(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    hex::encode(hasher.finalize())
}
