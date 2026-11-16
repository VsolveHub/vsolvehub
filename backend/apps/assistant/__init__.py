"""AI booking assistant: a customer chat that drives the existing booking commands.

The assistant owns conversations and nothing else. Services, slots, quotes, checkouts, payments
and confirmations stay in `catalog`, `carts` and `commerce`; every tool the model can call is a
thin wrapper over a command those apps already publish to the website. See ADR 0013.
"""
