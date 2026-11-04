# Deploying Headway

Served by nginx on the same server as the other sites (`ssh stopwatch`), behind Cloudflare. The wildcard Cloudflare origin certificate at `/etc/ssl/stopwatch.pem` already covers `headway.shivrajsinh.in`.

## First time only

Upload the site first, so nginx has something to serve the moment it is enabled. Its checks are skipped because nginx doesn't know the site yet:

```bash
ssh stopwatch 'sudo mkdir -p /var/www/headway && sudo chown ubuntu:root /var/www/headway'
```

```bash
DEPLOY_SKIP_CHECKS=1 deploy/deploy.sh
```

Then install the config and deploy again, this time with the checks:

```bash
scp deploy/nginx.conf stopwatch:/tmp/headway.nginx
```

```bash
ssh stopwatch 'sudo cp /tmp/headway.nginx /etc/nginx/sites-available/headway && sudo ln -sf /etc/nginx/sites-available/headway /etc/nginx/sites-enabled/headway && sudo nginx -t && sudo systemctl reload nginx'
```

```bash
deploy/deploy.sh
```

## Every release

```bash
npm run sync
```

```bash
deploy/deploy.sh
```

`deploy.sh` builds, stops if any page fails `verify-build`, uploads a new release, swaps it live in one step, checks a page of each type and goes back automatically if a check fails. It keeps the live release and the one before it.

## Going back

```bash
deploy/deploy.sh rollback
```
